/**
 * Core compaction logic: summarize old messages, flush key facts to memory.
 */

import { getHistory, compactMessages } from "../conversation.js";
import { appendMemory, readMemory } from "../../memory/store.js";
import { estimateMessagesTokens, shouldCompact } from "./token-counter.js";
import { pruneOldMessages } from "./pruner.js";
import { indexMemoryFile, getOllamaConfig } from "../../memory/embeddings.js";

export interface CompactionResult {
  originalMessageCount: number;
  compactedMessageCount: number;
  originalTokens: number;
  compactedTokens: number;
  memoryFlushed: boolean;
}

interface CompactionConfig {
  ollamaBaseUrl: string;
  ollamaModel: string;
  maxContextTokens: number;
  threshold: number; // default 0.75
}

let config: CompactionConfig | null = null;

export function setCompactionConfig(c: CompactionConfig): void {
  config = c;
}

function getConfig(): CompactionConfig {
  if (!config) {
    throw new Error("Compaction config not set — call setCompactionConfig() first");
  }
  return config;
}

/** Call Ollama to generate a summary of messages */
export async function summarizeMessages(
  messages: Array<{ role: string; content: string }>,
  ollamaBaseUrl: string,
  model: string,
): Promise<string> {
  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = `Summarize this conversation concisely, preserving:
- Key decisions and outcomes
- Important facts mentioned
- Current task context
- User preferences expressed

Conversation:
${conversationText}

Summary:`;

  const res = await fetch(`${ollamaBaseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!res.ok) {
    throw new Error(`Ollama summarization failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { response: string };
  return data.response.trim();
}

/** Extract important facts/decisions/preferences from messages and append to memory */
export async function flushToMemory(
  messages: Array<{ role: string; content: string }>,
): Promise<void> {
  const cfg = getConfig();

  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = `Extract key facts, decisions, and user preferences from this conversation that should be remembered long-term. Format as bullet points. Only include genuinely important information, not trivial details.

Conversation:
${conversationText}

Key facts:`;

  const res = await fetch(`${cfg.ollamaBaseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.ollamaModel, prompt, stream: false }),
  });

  if (!res.ok) {
    throw new Error(`Ollama memory extraction failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { response: string };
  const facts = data.response.trim();

  if (facts.length > 0) {
    const header = `\n## Compaction — ${new Date().toISOString().slice(0, 10)}\n`;
    await appendMemory(header + facts);

    // Re-index memory after flush (fire-and-forget)
    try {
      const ollamaConfig = getOllamaConfig();
      const content = await readMemory();
      indexMemoryFile("MEMORY.md", content, ollamaConfig).catch(() => {});
    } catch {
      // Non-critical: re-indexing can fail
    }
  }
}

/** Main compaction function */
export async function compactHistory(chatId: string): Promise<CompactionResult> {
  const cfg = getConfig();
  const history = getHistory(chatId);
  const mapped = history.map((m) => ({ role: m.role, content: m.content }));

  const originalTokens = estimateMessagesTokens(mapped);
  const originalMessageCount = history.length;

  // Check if compaction is actually needed
  if (!shouldCompact(mapped, cfg.maxContextTokens, cfg.threshold * 100)) {
    return {
      originalMessageCount,
      compactedMessageCount: originalMessageCount,
      originalTokens,
      compactedTokens: originalTokens,
      memoryFlushed: false,
    };
  }

  const { old, recent } = pruneOldMessages(mapped, 10);

  // Step 1: Flush key facts from old messages to persistent memory
  let memoryFlushed = false;
  if (old.length > 0) {
    try {
      await flushToMemory(old);
      memoryFlushed = true;
    } catch (err) {
      console.warn("Memory flush failed during compaction:", err);
    }
  }

  // Step 2: Summarize old messages
  let summary: string;
  if (old.length > 0) {
    summary = await summarizeMessages(old, cfg.ollamaBaseUrl, cfg.ollamaModel);
  } else {
    summary = "No previous context.";
  }

  // Step 3: Replace conversation with summary + recent messages
  compactMessages(chatId, summary);

  // Calculate new token count
  const newHistory = getHistory(chatId);
  const compactedTokens = estimateMessagesTokens(
    newHistory.map((m) => ({ role: m.role, content: m.content })),
  );

  return {
    originalMessageCount,
    compactedMessageCount: newHistory.length,
    originalTokens,
    compactedTokens,
    memoryFlushed,
  };
}
