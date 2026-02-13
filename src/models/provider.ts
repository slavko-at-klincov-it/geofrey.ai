/**
 * Provider interface — abstracts LLM providers (OpenRouter, future: local Ollama, Anthropic direct).
 * All types are re-exported from here so consumers import from one place.
 */

export interface GenerateParams {
  model: string;
  messages: ReadonlyArray<{ role: string; content: string }>;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
  model: string;
  finishReason: "stop" | "length" | "error" | "unknown";
}

export interface StreamChunk {
  text: string;
  done: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
}

export interface ModelProvider {
  readonly name: string;
  generate(params: GenerateParams): Promise<GenerateResult>;
  stream(params: GenerateParams): AsyncIterable<StreamChunk>;
  getModelInfo(modelId: string): ModelInfo | undefined;
}

/**
 * Retryable HTTP status codes — used by failover logic.
 */
export const RETRYABLE_STATUS_CODES: ReadonlyArray<number> = [429, 500, 502, 503];

/**
 * Error thrown by providers when the API returns a non-OK response.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
