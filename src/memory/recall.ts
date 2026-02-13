import { searchMemory, type OllamaConfig } from "./embeddings.js";

const SIMILARITY_THRESHOLD = 0.7;

export async function autoRecall(
  userMessage: string,
  config: OllamaConfig,
  dbUrl?: string,
): Promise<string> {
  const results = await searchMemory(userMessage, config, 5, dbUrl);
  const relevant = results.filter((r) => r.similarity >= SIMILARITY_THRESHOLD);

  if (relevant.length === 0) return "";

  const chunks = relevant.map((r) => r.content).join("\n---\n");
  return `<memory_context>\n${chunks}\n</memory_context>`;
}
