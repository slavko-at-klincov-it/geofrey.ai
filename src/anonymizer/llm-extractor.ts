/**
 * Optional LLM pass to extract personal/company/project names from text.
 * Uses Qwen3 8B via Ollama with a 5s timeout and graceful fallback.
 */

import { generateText } from "ai";
import { createOllama } from "ai-sdk-ollama";

const EXTRACTION_PROMPT = `Extract personal names, company names, and project names from the following text.
Return ONLY a JSON array of strings, nothing else. If none found, return [].

Example: ["John Smith", "AcmeCorp", "Project Zeus"]

Text:`;

const LLM_TIMEOUT_MS = 5_000;

export interface LlmExtractorConfig {
  ollamaBaseUrl: string;
  ollamaModel: string;
}

/**
 * Ask the LLM to extract sensitive names from text.
 * Returns extracted terms on success, empty array on timeout/failure.
 */
export async function extractNamesWithLlm(
  text: string,
  config: LlmExtractorConfig,
): Promise<string[]> {
  try {
    const ollama = createOllama({ baseURL: config.ollamaBaseUrl });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    const result = await generateText({
      model: ollama(config.ollamaModel),
      prompt: `${EXTRACTION_PROMPT}\n${text.slice(0, 2000)}`,
      abortSignal: controller.signal,
    });

    clearTimeout(timer);

    // Parse JSON array from response
    const trimmed = result.text.trim();
    const arrayMatch = /\[[\s\S]*\]/.exec(trimmed);
    if (!arrayMatch) return [];

    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item: unknown): item is string =>
        typeof item === "string" && item.length >= 2 && item.length <= 100,
    );
  } catch {
    // Timeout, parse error, or Ollama unavailable — silently skip
    return [];
  }
}
