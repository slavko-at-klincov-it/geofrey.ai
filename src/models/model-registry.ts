/**
 * Model registry — maps friendly model names to provider + model IDs,
 * supports task-based routing and failover chains.
 */

import type { ModelProvider, GenerateParams, GenerateResult, StreamChunk } from "./provider.js";
import { ProviderError, RETRYABLE_STATUS_CODES } from "./provider.js";

/** Friendly alias → OpenRouter model ID. */
const DEFAULT_MODEL_ALIASES: ReadonlyMap<string, string> = new Map([
  ["gpt-4o", "openai/gpt-4o"],
  ["gpt-4o-mini", "openai/gpt-4o-mini"],
  ["claude-sonnet", "anthropic/claude-sonnet-4-5-20250929"],
  ["gemini-pro", "google/gemini-2.0-flash"],
  ["deepseek-chat", "deepseek/deepseek-chat"],
  ["llama-3.3", "meta-llama/llama-3.3-70b-instruct"],
]);

const MAX_FAILOVER_ATTEMPTS = 3;

export interface ResolvedModel {
  provider: ModelProvider;
  actualModelId: string;
}

export interface ModelRegistryConfig {
  providers: ReadonlyArray<ModelProvider>;
  aliases?: ReadonlyMap<string, string>;
  /** Default provider name to use when model ID has no "/" prefix. */
  defaultProvider?: string;
}

export interface ModelRegistry {
  resolve(modelId: string): ResolvedModel;
  resolveAlias(modelId: string): string;
  generateWithFailover(
    params: GenerateParams,
    failoverChain: ReadonlyArray<string>,
  ): Promise<GenerateResult>;
  streamWithFailover(
    params: GenerateParams,
    failoverChain: ReadonlyArray<string>,
  ): AsyncIterable<StreamChunk>;
}

/**
 * Returns the model for a given task, falling back to defaultModel.
 */
export function getModelForTask(
  task: string,
  taskModels: Readonly<Record<string, string>>,
  defaultModel: string,
): string {
  return taskModels[task] ?? defaultModel;
}

export function createModelRegistry(config: ModelRegistryConfig): ModelRegistry {
  const providerMap = new Map<string, ModelProvider>();
  for (const provider of config.providers) {
    providerMap.set(provider.name, provider);
  }

  const aliases = config.aliases ?? DEFAULT_MODEL_ALIASES;

  function resolveAlias(modelId: string): string {
    return aliases.get(modelId) ?? modelId;
  }

  function findProviderForModel(modelId: string): ModelProvider {
    // If model ID contains "/", the prefix is the provider namespace (e.g., "openai/gpt-4o")
    if (modelId.includes("/")) {
      // Try all providers — OpenRouter handles all namespaced models
      for (const provider of config.providers) {
        return provider;
      }
    }

    // Use default provider if set
    if (config.defaultProvider) {
      const provider = providerMap.get(config.defaultProvider);
      if (provider) return provider;
    }

    // Fallback: return first registered provider
    const first = config.providers[0];
    if (first) return first;

    throw new Error(`No provider found for model "${modelId}"`);
  }

  function resolve(modelId: string): ResolvedModel {
    const actualModelId = resolveAlias(modelId);
    const provider = findProviderForModel(actualModelId);
    return { provider, actualModelId };
  }

  async function generateWithFailover(
    params: GenerateParams,
    failoverChain: ReadonlyArray<string>,
  ): Promise<GenerateResult> {
    const models = [params.model, ...failoverChain];
    const maxAttempts = Math.min(models.length, MAX_FAILOVER_ATTEMPTS);
    let lastError: Error | undefined;

    for (let i = 0; i < maxAttempts; i++) {
      const modelId = models[i];
      const { provider, actualModelId } = resolve(modelId);

      try {
        return await provider.generate({ ...params, model: actualModelId });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (err instanceof ProviderError && err.retryable && i < maxAttempts - 1) {
          const nextModel = models[i + 1];
          console.warn(
            `Model "${modelId}" failed (${err.status}), falling back to "${nextModel}"`,
          );

          // Respect retry-after if present and this is a 429
          if (err.retryAfterMs && err.status === 429) {
            const waitMs = Math.min(err.retryAfterMs, 10_000);
            await delay(waitMs);
          }
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error("All failover attempts exhausted");
  }

  async function* streamWithFailover(
    params: GenerateParams,
    failoverChain: ReadonlyArray<string>,
  ): AsyncIterable<StreamChunk> {
    const models = [params.model, ...failoverChain];
    const maxAttempts = Math.min(models.length, MAX_FAILOVER_ATTEMPTS);
    let lastError: Error | undefined;

    for (let i = 0; i < maxAttempts; i++) {
      const modelId = models[i];
      const { provider, actualModelId } = resolve(modelId);

      try {
        yield* provider.stream({ ...params, model: actualModelId });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (err instanceof ProviderError && err.retryable && i < maxAttempts - 1) {
          const nextModel = models[i + 1];
          console.warn(
            `Stream for "${modelId}" failed (${err.status}), falling back to "${nextModel}"`,
          );

          if (err.retryAfterMs && err.status === 429) {
            const waitMs = Math.min(err.retryAfterMs, 10_000);
            await delay(waitMs);
          }
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error("All failover attempts exhausted");
  }

  return {
    resolve,
    resolveAlias,
    generateWithFailover,
    streamWithFailover,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
