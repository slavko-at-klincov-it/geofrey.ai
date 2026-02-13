import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import {
  readMemory,
  writeMemory,
  appendMemory,
  readDailyNote,
  writeDailyNote,
  appendDailyNote,
} from "../memory/store.js";
import {
  searchMemory,
  getOllamaConfig,
  indexMemoryFile,
} from "../memory/embeddings.js";
import { appendStructuredEntry, type MemoryCategory } from "../memory/structured.js";
import { t } from "../i18n/index.js";

function reindexMemory(): void {
  try {
    const config = getOllamaConfig();
    readMemory().then((content) => {
      indexMemoryFile("MEMORY.md", content, config).catch(() => {});
    }).catch(() => {});
  } catch {
    // Non-critical: embeddings config may not be set yet
  }
}

registerTool({
  name: "memory_read",
  description: "Read persistent memory (MEMORY.md or daily notes)",
  parameters: z.object({
    type: z.enum(["main", "daily"]).default("main"),
    date: z.string().optional(),
    agentId: z.string().optional(),
  }),
  source: "native",
  execute: async ({ type, date, agentId }) => {
    const content = type === "daily"
      ? await readDailyNote(date, agentId)
      : await readMemory(agentId);
    return content.length > 0 ? content : t("memory.empty");
  },
});

registerTool({
  name: "memory_write",
  description: "Write to persistent memory (MEMORY.md or daily notes)",
  parameters: z.object({
    type: z.enum(["main", "daily"]).default("main"),
    content: z.string(),
    mode: z.enum(["overwrite", "append"]).default("append"),
    date: z.string().optional(),
    agentId: z.string().optional(),
  }),
  source: "native",
  execute: async ({ type, content, mode, date, agentId }) => {
    if (type === "daily") {
      if (mode === "overwrite") {
        await writeDailyNote(content, date, agentId);
      } else {
        await appendDailyNote(content, date, agentId);
      }
    } else {
      if (mode === "overwrite") {
        await writeMemory(content, agentId);
      } else {
        await appendMemory(content, agentId);
      }
      reindexMemory();
    }
    return t("memory.saved");
  },
});

registerTool({
  name: "memory_store",
  description: "Store a categorized entry in persistent memory. Categories: preferences, decisions, facts, wants, doesnt-want.",
  parameters: z.object({
    category: z.enum(["preferences", "decisions", "facts", "wants", "doesnt-want"]),
    content: z.string(),
  }),
  source: "native",
  execute: async ({ category, content }) => {
    await appendStructuredEntry({ category: category as MemoryCategory, content });
    reindexMemory();
    return t("memory.stored", { category });
  },
});

registerTool({
  name: "memory_search",
  description: "Search persistent memory using semantic similarity",
  parameters: z.object({
    query: z.string(),
    topK: z.number().int().positive().default(5),
  }),
  source: "native",
  execute: async ({ query, topK }) => {
    const config = getOllamaConfig();
    const results = await searchMemory(query, config, topK);
    const relevant = results.filter((r) => r.similarity >= 0.7);

    if (relevant.length === 0) {
      return t("memory.empty");
    }

    const formatted = relevant
      .map((r) => `[${r.source}] (${(r.similarity * 100).toFixed(1)}%)\n${r.content}`)
      .join("\n---\n");

    return `${t("memory.searchResults", { count: relevant.length })}\n\n${formatted}`;
  },
});
