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
