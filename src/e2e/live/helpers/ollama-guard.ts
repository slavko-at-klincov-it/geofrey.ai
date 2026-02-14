/**
 * Guard: skip E2E tests if Ollama is not reachable or model not available.
 */

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "qwen3:8b";
const DEFAULT_EMBED_MODEL = "nomic-embed-text";

export function getOllamaBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
}

export function getE2eModel(): string {
  return process.env.E2E_MODEL ?? DEFAULT_MODEL;
}

export function getE2eEmbedModel(): string {
  return process.env.EMBEDDING_MODEL ?? DEFAULT_EMBED_MODEL;
}

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${getOllamaBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function isModelAvailable(model?: string): Promise<boolean> {
  const target = model ?? getE2eModel();
  const base = target.split(":")[0];
  try {
    const res = await fetch(`${getOllamaBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return data.models?.some((m) => m.name.startsWith(base)) ?? false;
  } catch {
    return false;
  }
}

/**
 * Check if the Ollama embed API works for the given model.
 * Returns false if embeddings aren't supported (501 Not Implemented).
 */
export async function isEmbedAvailable(model?: string): Promise<boolean> {
  const target = model ?? getE2eModel();
  try {
    const res = await fetch(`${getOllamaBaseUrl()}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: target, input: "test" }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Call at top of describe block:
 *   const guard = await ensureOllama();
 *   if (guard.skip) { describe.skip(...); return; }
 */
export async function ensureOllama(model?: string): Promise<{
  skip: boolean;
  reason?: string;
  baseUrl: string;
  model: string;
  embedModel: string;
  embedAvailable: boolean;
}> {
  const baseUrl = getOllamaBaseUrl();
  const m = model ?? getE2eModel();
  const em = getE2eEmbedModel();

  if (!(await isOllamaAvailable())) {
    return { skip: true, reason: "Ollama not reachable", baseUrl, model: m, embedModel: em, embedAvailable: false };
  }
  if (!(await isModelAvailable(m))) {
    return { skip: true, reason: `Model ${m} not available`, baseUrl, model: m, embedModel: em, embedAvailable: false };
  }
  const embedAvailable = await isEmbedAvailable(em);
  return { skip: false, baseUrl, model: m, embedModel: em, embedAvailable };
}
