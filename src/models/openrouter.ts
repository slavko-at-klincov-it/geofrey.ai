/**
 * OpenRouter provider — OpenAI-compatible API via https://openrouter.ai/api/v1/chat/completions.
 * Uses native fetch (no SDK dependency). Supports generate + SSE streaming.
 */

import type {
  ModelProvider,
  GenerateParams,
  GenerateResult,
  StreamChunk,
  ModelInfo,
} from "./provider.js";
import { ProviderError, RETRYABLE_STATUS_CODES } from "./provider.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_TITLE = "Geofrey";
const OPENROUTER_REFERER = "https://github.com/geofrey-ai";

/** Known model metadata for cost tracking and context info. */
const MODEL_INFO_MAP: ReadonlyMap<string, ModelInfo> = new Map([
  ["openai/gpt-4o", {
    id: "openai/gpt-4o", name: "GPT-4o", provider: "openai",
    contextLength: 128_000, inputCostPer1k: 0.0025, outputCostPer1k: 0.01,
  }],
  ["openai/gpt-4o-mini", {
    id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "openai",
    contextLength: 128_000, inputCostPer1k: 0.00015, outputCostPer1k: 0.0006,
  }],
  ["anthropic/claude-sonnet-4-5-20250929", {
    id: "anthropic/claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "anthropic",
    contextLength: 200_000, inputCostPer1k: 0.003, outputCostPer1k: 0.015,
  }],
  ["google/gemini-2.0-flash", {
    id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "google",
    contextLength: 1_000_000, inputCostPer1k: 0.0001, outputCostPer1k: 0.0004,
  }],
  ["deepseek/deepseek-chat", {
    id: "deepseek/deepseek-chat", name: "DeepSeek Chat", provider: "deepseek",
    contextLength: 128_000, inputCostPer1k: 0.00014, outputCostPer1k: 0.00028,
  }],
  ["meta-llama/llama-3.3-70b-instruct", {
    id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", provider: "meta",
    contextLength: 131_072, inputCostPer1k: 0.00039, outputCostPer1k: 0.0004,
  }],
]);

interface OpenRouterMessage {
  role: string;
  content: string;
}

interface OpenRouterRequestBody {
  model: string;
  messages: OpenRouterMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

interface OpenRouterChoice {
  message: { role: string; content: string | null };
  finish_reason: string | null;
}

interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: OpenRouterChoice[];
  usage?: OpenRouterUsage;
}

interface OpenRouterErrorBody {
  error?: { message?: string; code?: number };
}

interface OpenRouterStreamDelta {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: OpenRouterUsage;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Title": OPENROUTER_TITLE,
    "HTTP-Referer": OPENROUTER_REFERER,
  };
}

function buildRequestBody(params: GenerateParams, stream: boolean): OpenRouterRequestBody {
  const messages: OpenRouterMessage[] = [];
  if (params.system) {
    messages.push({ role: "system", content: params.system });
  }
  for (const msg of params.messages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const body: OpenRouterRequestBody = {
    model: params.model,
    messages,
    stream,
  };
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;
  return body;
}

function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return undefined;
}

function mapFinishReason(reason: string | null): GenerateResult["finishReason"] {
  switch (reason) {
    case "stop": return "stop";
    case "length": return "length";
    case "error": return "error";
    default: return "unknown";
  }
}

async function handleErrorResponse(response: Response): Promise<never> {
  let message = `OpenRouter API error: ${response.status} ${response.statusText}`;
  try {
    const body = await response.json() as OpenRouterErrorBody;
    if (body.error?.message) {
      message = `OpenRouter: ${body.error.message}`;
    }
  } catch {
    // Use default message if body isn't parseable
  }

  const retryable = RETRYABLE_STATUS_CODES.includes(response.status);
  const retryAfterMs = parseRetryAfter(response.headers);
  throw new ProviderError(message, response.status, retryable, retryAfterMs);
}

/**
 * Parse a single SSE line. Returns the parsed JSON data or undefined if not a data line.
 */
function parseSSELine(line: string): OpenRouterStreamDelta | undefined {
  if (!line.startsWith("data: ")) return undefined;
  const payload = line.slice(6).trim();
  if (payload === "[DONE]") return undefined;
  try {
    return JSON.parse(payload) as OpenRouterStreamDelta;
  } catch {
    return undefined;
  }
}

export function createOpenRouterProvider(apiKey: string): ModelProvider {
  const headers = buildHeaders(apiKey);

  async function generate(params: GenerateParams): Promise<GenerateResult> {
    const body = buildRequestBody(params, false);
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await handleErrorResponse(response);
    }

    const data = await response.json() as OpenRouterResponse;
    const choice = data.choices[0];
    const text = choice?.message?.content ?? "";
    const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

    return {
      text,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
      },
      model: data.model,
      finishReason: mapFinishReason(choice?.finish_reason ?? null),
    };
  }

  async function* stream(params: GenerateParams): AsyncIterable<StreamChunk> {
    const body = buildRequestBody(params, true);
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await handleErrorResponse(response);
    }

    if (!response.body) {
      throw new ProviderError("OpenRouter: no response body for stream", 500, false);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep last potentially incomplete line in buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed === "data: [DONE]") {
            yield { text: "", done: true };
            return;
          }

          const parsed = parseSSELine(trimmed);
          if (!parsed) continue;

          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content ?? "";
          const finishReason = parsed.choices?.[0]?.finish_reason;

          if (content) {
            yield { text: content, done: false };
          }
          if (finishReason) {
            yield { text: "", done: true };
            return;
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        if (buffer.trim() === "data: [DONE]") {
          yield { text: "", done: true };
        } else {
          const parsed = parseSSELine(buffer.trim());
          if (parsed) {
            const content = parsed.choices?.[0]?.delta?.content ?? "";
            if (content) {
              yield { text: content, done: false };
            }
          }
          yield { text: "", done: true };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  function getModelInfo(modelId: string): ModelInfo | undefined {
    return MODEL_INFO_MAP.get(modelId);
  }

  return {
    name: "openrouter",
    generate,
    stream,
    getModelInfo,
  };
}
