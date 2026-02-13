export interface ModelPricing {
  inputPer1kTokens: number;  // USD per 1K input tokens
  outputPer1kTokens: number; // USD per 1K output tokens
}

const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // Claude models
  "claude-sonnet-4-5-20250929": { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
  "claude-opus-4-6": { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 },
  "claude-haiku-4-5-20251001": { inputPer1kTokens: 0.0008, outputPer1kTokens: 0.004 },
  // Ollama/local models (free)
  "qwen3:8b": { inputPer1kTokens: 0, outputPer1kTokens: 0 },
  // OpenRouter models
  "openai/gpt-4o": { inputPer1kTokens: 0.0025, outputPer1kTokens: 0.01 },
  "openai/gpt-4o-mini": { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
  "anthropic/claude-sonnet-4-5-20250929": { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
  "google/gemini-2.0-flash": { inputPer1kTokens: 0.0001, outputPer1kTokens: 0.0004 },
  "deepseek/deepseek-chat": { inputPer1kTokens: 0.00014, outputPer1kTokens: 0.00028 },
  "meta-llama/llama-3.3-70b-instruct": { inputPer1kTokens: 0.00039, outputPer1kTokens: 0.0004 },
};

const ZERO_PRICING: ModelPricing = { inputPer1kTokens: 0, outputPer1kTokens: 0 };

export function getModelPricing(model: string): ModelPricing {
  return DEFAULT_PRICING[model] ?? ZERO_PRICING;
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(model);
  return (inputTokens / 1000) * pricing.inputPer1kTokens +
         (outputTokens / 1000) * pricing.outputPer1kTokens;
}
