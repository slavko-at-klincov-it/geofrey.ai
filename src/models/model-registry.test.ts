import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createModelRegistry, getModelForTask } from "./model-registry.js";
import type { ModelProvider, GenerateParams, GenerateResult, StreamChunk, ModelInfo } from "./provider.js";
import { ProviderError } from "./provider.js";

/** Create a stub provider for testing. */
function createStubProvider(
  name: string,
  overrides?: {
    generate?: (params: GenerateParams) => Promise<GenerateResult>;
    stream?: (params: GenerateParams) => AsyncIterable<StreamChunk>;
  },
): ModelProvider {
  const defaultGenerate = async (params: GenerateParams): Promise<GenerateResult> => ({
    text: `response from ${name}`,
    usage: { promptTokens: 10, completionTokens: 5 },
    model: params.model,
    finishReason: "stop",
  });

  async function* defaultStream(params: GenerateParams): AsyncIterable<StreamChunk> {
    yield { text: `streamed from ${name}`, done: false };
    yield { text: "", done: true };
  }

  return {
    name,
    generate: overrides?.generate ?? defaultGenerate,
    stream: overrides?.stream ?? defaultStream,
    getModelInfo: (_modelId: string): ModelInfo | undefined => undefined,
  };
}

describe("model-registry", () => {
  describe("resolve", () => {
    it("resolves known alias to full model ID", () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      const resolved = registry.resolve("gpt-4o");
      assert.equal(resolved.actualModelId, "openai/gpt-4o");
      assert.equal(resolved.provider.name, "openrouter");
    });

    it("resolves claude-sonnet alias", () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      const resolved = registry.resolve("claude-sonnet");
      assert.equal(resolved.actualModelId, "anthropic/claude-sonnet-4-5-20250929");
    });

    it("resolves gemini-pro alias", () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      const resolved = registry.resolve("gemini-pro");
      assert.equal(resolved.actualModelId, "google/gemini-2.0-flash");
    });

    it("resolves deepseek-chat alias", () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      const resolved = registry.resolve("deepseek-chat");
      assert.equal(resolved.actualModelId, "deepseek/deepseek-chat");
    });

    it("resolves llama-3.3 alias", () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      const resolved = registry.resolve("llama-3.3");
      assert.equal(resolved.actualModelId, "meta-llama/llama-3.3-70b-instruct");
    });

    it("passes through unknown model IDs unchanged", () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      const resolved = registry.resolve("custom/my-model");
      assert.equal(resolved.actualModelId, "custom/my-model");
    });

    it("passes through unknown non-aliased names unchanged", () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      const resolved = registry.resolve("some-new-model");
      assert.equal(resolved.actualModelId, "some-new-model");
    });

    it("uses custom aliases when provided", () => {
      const provider = createStubProvider("openrouter");
      const customAliases = new Map([["my-fast", "openai/gpt-4o-mini"]]);
      const registry = createModelRegistry({ providers: [provider], aliases: customAliases });

      const resolved = registry.resolve("my-fast");
      assert.equal(resolved.actualModelId, "openai/gpt-4o-mini");
    });

    it("uses default provider when specified", () => {
      const providerA = createStubProvider("provider-a");
      const providerB = createStubProvider("provider-b");
      const registry = createModelRegistry({
        providers: [providerA, providerB],
        defaultProvider: "provider-b",
      });

      const resolved = registry.resolve("some-model");
      assert.equal(resolved.provider.name, "provider-b");
    });

    it("throws when no providers registered", () => {
      const registry = createModelRegistry({ providers: [] });

      assert.throws(
        () => registry.resolve("gpt-4o"),
        /No provider found/,
      );
    });
  });

  describe("resolveAlias", () => {
    it("maps known aliases to model IDs", () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      assert.equal(registry.resolveAlias("gpt-4o"), "openai/gpt-4o");
      assert.equal(registry.resolveAlias("gpt-4o-mini"), "openai/gpt-4o-mini");
    });

    it("returns input unchanged for unknown aliases", () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      assert.equal(registry.resolveAlias("unknown-model"), "unknown-model");
    });
  });

  describe("getModelForTask", () => {
    it("returns task-specific model when configured", () => {
      const taskModels = { orchestrator: "gpt-4o", coder: "claude-sonnet" };
      assert.equal(getModelForTask("orchestrator", taskModels, "default-model"), "gpt-4o");
      assert.equal(getModelForTask("coder", taskModels, "default-model"), "claude-sonnet");
    });

    it("returns default model for unconfigured tasks", () => {
      const taskModels = { orchestrator: "gpt-4o" };
      assert.equal(getModelForTask("classifier", taskModels, "default-model"), "default-model");
    });

    it("returns default model when taskModels is empty", () => {
      assert.equal(getModelForTask("orchestrator", {}, "default-model"), "default-model");
    });
  });

  describe("generateWithFailover", () => {
    it("returns result from primary model on success", async () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      const result = await registry.generateWithFailover(
        { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
        ["gemini-pro"],
      );

      assert.equal(result.text, "response from openrouter");
    });

    it("falls back on retryable error", async () => {
      let callCount = 0;
      const provider = createStubProvider("openrouter", {
        generate: async (params) => {
          callCount++;
          if (callCount === 1) {
            throw new ProviderError("Rate limited", 429, true, 0);
          }
          return {
            text: `fallback response for ${params.model}`,
            usage: { promptTokens: 10, completionTokens: 5 },
            model: params.model,
            finishReason: "stop",
          };
        },
      });

      const registry = createModelRegistry({ providers: [provider] });

      const result = await registry.generateWithFailover(
        { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
        ["gemini-pro"],
      );

      assert.equal(callCount, 2);
      assert.ok(result.text.includes("fallback response"));
    });

    it("throws immediately on non-retryable error", async () => {
      const provider = createStubProvider("openrouter", {
        generate: async () => {
          throw new ProviderError("Invalid key", 401, false);
        },
      });

      const registry = createModelRegistry({ providers: [provider] });

      await assert.rejects(
        () => registry.generateWithFailover(
          { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
          ["gemini-pro"],
        ),
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 401);
          return true;
        },
      );
    });

    it("respects max 3 attempts limit", async () => {
      let callCount = 0;
      const provider = createStubProvider("openrouter", {
        generate: async () => {
          callCount++;
          throw new ProviderError("Server error", 500, true);
        },
      });

      const registry = createModelRegistry({ providers: [provider] });

      await assert.rejects(
        () => registry.generateWithFailover(
          { model: "model-a", messages: [] },
          ["model-b", "model-c", "model-d", "model-e"],
        ),
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          return true;
        },
      );

      assert.equal(callCount, 3);
    });

    it("exhausts all models and throws last error", async () => {
      let callCount = 0;
      const provider = createStubProvider("openrouter", {
        generate: async () => {
          callCount++;
          throw new ProviderError(`Error ${callCount}`, 502, true);
        },
      });

      const registry = createModelRegistry({ providers: [provider] });

      await assert.rejects(
        () => registry.generateWithFailover(
          { model: "model-a", messages: [] },
          ["model-b"],
        ),
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 502);
          return true;
        },
      );

      assert.equal(callCount, 2);
    });

    it("succeeds on third attempt", async () => {
      let callCount = 0;
      const provider = createStubProvider("openrouter", {
        generate: async (params) => {
          callCount++;
          if (callCount <= 2) {
            throw new ProviderError("Fail", 503, true);
          }
          return {
            text: "third time lucky",
            usage: { promptTokens: 10, completionTokens: 5 },
            model: params.model,
            finishReason: "stop",
          };
        },
      });

      const registry = createModelRegistry({ providers: [provider] });

      const result = await registry.generateWithFailover(
        { model: "model-a", messages: [] },
        ["model-b", "model-c"],
      );

      assert.equal(result.text, "third time lucky");
      assert.equal(callCount, 3);
    });
  });

  describe("streamWithFailover", () => {
    it("yields chunks from primary model on success", async () => {
      const provider = createStubProvider("openrouter");
      const registry = createModelRegistry({ providers: [provider] });

      const chunks: StreamChunk[] = [];
      for await (const chunk of registry.streamWithFailover(
        { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
        ["gemini-pro"],
      )) {
        chunks.push(chunk);
      }

      assert.ok(chunks.length >= 1);
      assert.equal(chunks[0].text, "streamed from openrouter");
    });

    it("falls back to next model on retryable stream error", async () => {
      let callCount = 0;
      const provider = createStubProvider("openrouter", {
        stream: async function* (params) {
          callCount++;
          if (callCount === 1) {
            throw new ProviderError("Rate limited", 429, true, 0);
          }
          yield { text: `fallback stream ${params.model}`, done: false };
          yield { text: "", done: true };
        },
      });

      const registry = createModelRegistry({ providers: [provider] });

      const chunks: StreamChunk[] = [];
      for await (const chunk of registry.streamWithFailover(
        { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
        ["gemini-pro"],
      )) {
        chunks.push(chunk);
      }

      assert.equal(callCount, 2);
      const textChunks = chunks.filter((c) => c.text !== "");
      assert.ok(textChunks[0].text.includes("fallback stream"));
    });

    it("throws on non-retryable stream error", async () => {
      const provider = createStubProvider("openrouter", {
        stream: async function* () {
          throw new ProviderError("Forbidden", 403, false);
        },
      });

      const registry = createModelRegistry({ providers: [provider] });

      await assert.rejects(
        async () => {
          for await (const _chunk of registry.streamWithFailover(
            { model: "gpt-4o", messages: [] },
            ["gemini-pro"],
          )) {
            // Should not reach here
          }
        },
        (err: unknown) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 403);
          return true;
        },
      );
    });
  });
});
