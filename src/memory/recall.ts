import { searchMemory, type OllamaConfig, type SearchResult } from "./embeddings.js";

const SIMILARITY_THRESHOLD = 0.7;
const CATEGORY_BOOST = 0.05;
const BOOSTED_PATTERNS = /^##\s*(Decisions|Doesn't-Want|Doesnt-Want)/im;

function applyBoosting(results: SearchResult[]): SearchResult[] {
  return results.map((r) => {
    if (BOOSTED_PATTERNS.test(r.content)) {
      return { ...r, similarity: Math.min(1, r.similarity + CATEGORY_BOOST) };
    }
    return r;
  });
}

export async function autoRecall(
  userMessage: string,
  config: OllamaConfig,
  dbUrl?: string,
): Promise<string> {
  const raw = await searchMemory(userMessage, config, 5, dbUrl);
  const boosted = applyBoosting(raw);
  boosted.sort((a, b) => b.similarity - a.similarity);

  const relevant = boosted.filter((r) => r.similarity >= SIMILARITY_THRESHOLD);

  if (relevant.length === 0) return "";

  const chunks = relevant.map((r) => r.content).join("\n---\n");
  return `<memory_context>\n${chunks}\n</memory_context>`;
}
