import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setMemoryDir, readMemory } from "../../memory/store.js";
import { getOrCreate, addMessage, getHistory } from "../conversation.js";
import {
  compactHistory,
  setCompactionConfig,
  summarizeMessages,
  flushToMemory,
} from "./compactor.js";

let tempDir: string;
let chatId: string;
let counter = 5000;

// Helper to create a mock fetch that returns a given response
function createMockFetch(response: string) {
  return mock.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(JSON.stringify({ response }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("compactor", () => {
  beforeEach(async () => {
    counter++;
    chatId = `compact-${counter}`;
    tempDir = await mkdtemp(join(tmpdir(), "compactor-"));
    setMemoryDir(tempDir);
    setCompactionConfig({
      ollamaBaseUrl: "http://localhost:11434",
      ollamaModel: "qwen3:8b",
      maxContextTokens: 100, // Tiny context for easy threshold testing
      threshold: 0.75,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("summarizeMessages", () => {
    it("calls Ollama and returns trimmed response", async () => {
      const mockFetch = createMockFetch("  This is a summary.  ");
      const original = globalThis.fetch;
      globalThis.fetch = mockFetch as typeof globalThis.fetch;

      try {
        const result = await summarizeMessages(
          [{ role: "user", content: "Hello" }],
          "http://localhost:11434",
          "qwen3:8b",
        );
        assert.equal(result, "This is a summary.");
        assert.equal(mockFetch.mock.callCount(), 1);

        const [url, init] = mockFetch.mock.calls[0].arguments;
        assert.equal(url, "http://localhost:11434/api/generate");
        const body = JSON.parse((init as RequestInit).body as string);
        assert.equal(body.model, "qwen3:8b");
        assert.equal(body.stream, false);
        assert.ok(body.prompt.includes("Hello"));
      } finally {
        globalThis.fetch = original;
      }
    });

    it("throws on non-OK response", async () => {
      const original = globalThis.fetch;
      globalThis.fetch = mock.fn(async () => {
        return new Response("error", { status: 500, statusText: "Internal Server Error" });
      }) as typeof globalThis.fetch;

      try {
        await assert.rejects(
          () => summarizeMessages(
            [{ role: "user", content: "test" }],
            "http://localhost:11434",
            "qwen3:8b",
          ),
          { message: /Ollama summarization failed: 500/ },
        );
      } finally {
        globalThis.fetch = original;
      }
    });
  });

  describe("flushToMemory", () => {
    it("appends extracted facts to memory", async () => {
      const mockFetch = createMockFetch("- User prefers dark mode\n- Project uses TypeScript");
      const original = globalThis.fetch;
      globalThis.fetch = mockFetch as typeof globalThis.fetch;

      try {
        await flushToMemory([
          { role: "user", content: "I prefer dark mode" },
          { role: "assistant", content: "Noted, dark mode preference saved" },
        ]);

        const memory = await readMemory();
        assert.ok(memory.includes("User prefers dark mode"));
        assert.ok(memory.includes("Project uses TypeScript"));
        assert.ok(memory.includes("## Compaction"));
      } finally {
        globalThis.fetch = original;
      }
    });

    it("does not append if response is empty", async () => {
      const mockFetch = createMockFetch("   ");
      const original = globalThis.fetch;
      globalThis.fetch = mockFetch as typeof globalThis.fetch;

      try {
        await flushToMemory([{ role: "user", content: "trivial" }]);
        const memory = await readMemory();
        assert.equal(memory, "");
      } finally {
        globalThis.fetch = original;
      }
    });
  });

  describe("compactHistory", () => {
    it("does not compact when below threshold", async () => {
      // Add a small message — well below 75% of 100 tokens
      getOrCreate(chatId);
      addMessage(chatId, { role: "user", content: "hi" });

      const result = await compactHistory(chatId);
      assert.equal(result.originalMessageCount, 1);
      assert.equal(result.compactedMessageCount, 1);
      assert.equal(result.memoryFlushed, false);
    });

    it("compacts when above threshold", async () => {
      const mockFetch = createMockFetch("Summary of conversation");
      const original = globalThis.fetch;
      globalThis.fetch = mockFetch as typeof globalThis.fetch;

      try {
        getOrCreate(chatId);
        // Add enough messages to exceed 75% of 100 tokens
        for (let i = 0; i < 20; i++) {
          addMessage(chatId, { role: "user", content: `Message number ${i} with some content to fill up tokens` });
          addMessage(chatId, { role: "assistant", content: `Response ${i} with additional text` });
        }

        const beforeCount = getHistory(chatId).length;
        assert.equal(beforeCount, 40);

        const result = await compactHistory(chatId);
        assert.equal(result.originalMessageCount, 40);
        // 1 summary + 10 recent = 11
        assert.equal(result.compactedMessageCount, 11);
        assert.ok(result.compactedTokens < result.originalTokens);

        // Check summary message is present
        const history = getHistory(chatId);
        assert.equal(history[0].role, "system");
        assert.ok(history[0].content.includes("[Previous conversation summary]"));
        assert.ok(history[0].content.includes("Summary of conversation"));
      } finally {
        globalThis.fetch = original;
      }
    });

    it("preserves last 10 messages during compaction", async () => {
      const mockFetch = createMockFetch("Summary");
      const original = globalThis.fetch;
      globalThis.fetch = mockFetch as typeof globalThis.fetch;

      try {
        getOrCreate(chatId);
        for (let i = 0; i < 15; i++) {
          addMessage(chatId, { role: "user", content: `msg-${i} ${"x".repeat(30)}` });
        }

        await compactHistory(chatId);

        const history = getHistory(chatId);
        // 1 summary + 10 recent
        assert.equal(history.length, 11);
        // Last message should be msg-14
        assert.ok(history[history.length - 1].content.startsWith("msg-14"));
        // First recent should be msg-5
        assert.ok(history[1].content.startsWith("msg-5"));
      } finally {
        globalThis.fetch = original;
      }
    });

    it("flushes memory during compaction", async () => {
      // First call returns memory facts, second returns summary
      let callCount = 0;
      const original = globalThis.fetch;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        const response = callCount === 1
          ? "- Important fact from conversation"
          : "Summary of old messages";
        return new Response(JSON.stringify({ response }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof globalThis.fetch;

      try {
        getOrCreate(chatId);
        for (let i = 0; i < 20; i++) {
          addMessage(chatId, { role: "user", content: `msg-${i} ${"y".repeat(30)}` });
        }

        const result = await compactHistory(chatId);
        assert.equal(result.memoryFlushed, true);

        const memory = await readMemory();
        assert.ok(memory.includes("Important fact from conversation"));
      } finally {
        globalThis.fetch = original;
      }
    });

    it("continues compaction even if memory flush fails", async () => {
      let callCount = 0;
      const original = globalThis.fetch;
      globalThis.fetch = mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          // Memory flush fails
          return new Response("error", { status: 500, statusText: "Server Error" });
        }
        // Summary succeeds
        return new Response(JSON.stringify({ response: "Summary" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof globalThis.fetch;

      try {
        getOrCreate(chatId);
        for (let i = 0; i < 20; i++) {
          addMessage(chatId, { role: "user", content: `msg-${i} ${"z".repeat(30)}` });
        }

        const result = await compactHistory(chatId);
        assert.equal(result.memoryFlushed, false);
        assert.equal(result.compactedMessageCount, 11);
      } finally {
        globalThis.fetch = original;
      }
    });
  });
});
