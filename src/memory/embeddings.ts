import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { memoryChunks } from "../db/schema.js";
import { readMemory, listMemoryFiles, readDailyNote } from "./store.js";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

let ollamaConfig: OllamaConfig | null = null;

export function setOllamaConfig(config: OllamaConfig): void {
  ollamaConfig = config;
}

export function getOllamaConfig(): OllamaConfig {
  if (!ollamaConfig) {
    throw new Error("Ollama config not set — call setOllamaConfig() first");
  }
  return ollamaConfig;
}

const APPROX_CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_TOKENS = 400;

export function chunkText(text: string, maxTokens: number = DEFAULT_MAX_TOKENS): string[] {
  const maxChars = maxTokens * APPROX_CHARS_PER_TOKEN;

  if (text.length <= maxChars) {
    return text.trim().length > 0 ? [text.trim()] : [];
  }

  // Split on double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length === 0) continue;

    // If a single paragraph exceeds maxChars, split on sentences
    if (trimmed.length > maxChars) {
      if (current.trim().length > 0) {
        chunks.push(current.trim());
        current = "";
      }
      const sentences = trimmed.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if ((current + " " + sentence).trim().length > maxChars && current.trim().length > 0) {
          chunks.push(current.trim());
          current = sentence;
        } else {
          current = current.length > 0 ? current + " " + sentence : sentence;
        }
      }
      continue;
    }

    const combined = current.length > 0 ? current + "\n\n" + trimmed : trimmed;
    if (combined.length > maxChars && current.trim().length > 0) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current = combined;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

export async function generateEmbedding(text: string, config: OllamaConfig): Promise<number[]> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/api/embed`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, input: text }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embed failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { embeddings: number[][] };
  return data.embeddings[0];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function indexMemory(config: OllamaConfig, dbUrl?: string): Promise<number> {
  const db = getDb(dbUrl ?? "./data/app.db");

  // Clear existing chunks
  db.delete(memoryChunks).run();

  const files = await listMemoryFiles();
  let totalChunks = 0;

  for (const file of files) {
    const content = file === "MEMORY.md"
      ? await readMemory()
      : await readDailyNote(file.replace(/\.md$/, ""));

    if (content.trim().length === 0) continue;

    const chunks = chunkText(content);

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i], config);

      db.insert(memoryChunks).values({
        id: `${file}:${i}`,
        source: file,
        chunkIndex: i,
        content: chunks[i],
        embedding: JSON.stringify(embedding),
        createdAt: new Date(),
      }).run();

      totalChunks++;
    }
  }

  return totalChunks;
}

export async function indexMemoryFile(
  source: string,
  content: string,
  config: OllamaConfig,
  dbUrl?: string,
): Promise<number> {
  const db = getDb(dbUrl ?? "./data/app.db");

  // Delete only chunks from this source
  db.delete(memoryChunks).where(eq(memoryChunks.source, source)).run();

  if (content.trim().length === 0) return 0;

  const chunks = chunkText(content);
  let count = 0;

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i], config);

    db.insert(memoryChunks).values({
      id: `${source}:${i}`,
      source,
      chunkIndex: i,
      content: chunks[i],
      embedding: JSON.stringify(embedding),
      createdAt: new Date(),
    }).run();

    count++;
  }

  return count;
}

export interface SearchResult {
  source: string;
  content: string;
  similarity: number;
}

export async function searchMemory(
  query: string,
  config: OllamaConfig,
  topK: number = 5,
  dbUrl?: string,
): Promise<SearchResult[]> {
  const db = getDb(dbUrl ?? "./data/app.db");
  const queryEmbedding = await generateEmbedding(query, config);

  const allChunks = db.select().from(memoryChunks).all();

  const scored = allChunks.map((chunk) => ({
    source: chunk.source,
    content: chunk.content,
    similarity: cosineSimilarity(queryEmbedding, JSON.parse(chunk.embedding) as number[]),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, topK);
}
