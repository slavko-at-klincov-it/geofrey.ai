import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeMemory, readMemory } from "../../memory/store.js";
import { indexMemory, searchMemory, indexMemoryFile, type OllamaConfig } from "../../memory/embeddings.js";
import { autoRecall } from "../../memory/recall.js";
import { getDb } from "../../db/client.js";
import { ensureOllama } from "./helpers/ollama-guard.js";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";
import { buildMemoryMarkdown } from "./helpers/fixtures.js";

describe("E2E: Memory System (Embeddings + Semantic Search)", { timeout: 120_000 }, () => {
  let env: TestEnv;
  let ollamaConfig: OllamaConfig;
  let embedAvailable = false;

  before(async () => {
    env = await createTestEnv();
    const guard = await ensureOllama();
    embedAvailable = !guard.skip && guard.embedAvailable;
    ollamaConfig = { baseUrl: guard.baseUrl, model: guard.model, embedModel: guard.embedModel };
    // Initialize DB
    getDb(env.dbUrl);
  });

  after(async () => {
    await env.cleanup();
  });

  it("writes, indexes, and searches memory (Ollama + embed required)", async (t) => {
    if (!embedAvailable) {
      t.skip("Ollama embedding not available");
      return;
    }

    const markdown = buildMemoryMarkdown();
    await writeMemory(markdown);

    const chunks = await indexMemory(ollamaConfig, env.dbUrl);
    assert.ok(chunks > 0, `Expected >0 chunks, got ${chunks}`);

    const results = await searchMemory("dark mode editor theme", ollamaConfig, 5, env.dbUrl);
    assert.ok(results.length > 0, "Should find at least one result");

    const topResult = results[0];
    assert.ok(topResult.similarity > 0.3, `Top similarity should be >0.3, got ${topResult.similarity}`);
  });

  it("semantic search ranks relevant content higher (Ollama + embed required)", async (t) => {
    if (!embedAvailable) {
      t.skip("Ollama embedding not available");
      return;
    }

    const content = await readMemory();
    if (!content) {
      await writeMemory(buildMemoryMarkdown());
      await indexMemory(ollamaConfig, env.dbUrl);
    }

    const results = await searchMemory("cloud services and OpenRouter", ollamaConfig, 5, env.dbUrl);
    assert.ok(results.length > 0, "Should find results for cloud services query");

    const hasRelevant = results.some(
      (r) => r.content.toLowerCase().includes("openrouter") || r.content.toLowerCase().includes("cloud"),
    );
    assert.ok(hasRelevant, "Should find content mentioning OpenRouter or cloud");
  });

  it("autoRecall returns relevant context (Ollama + embed required)", async (t) => {
    if (!embedAvailable) {
      t.skip("Ollama embedding not available");
      return;
    }

    const content = await readMemory();
    if (!content) {
      await writeMemory(buildMemoryMarkdown());
      await indexMemory(ollamaConfig, env.dbUrl);
    }

    const context = await autoRecall("Tell me about the decision on OpenRouter", ollamaConfig, env.dbUrl);
    assert.ok(typeof context === "string", "Should return a string");
    if (context.length > 0) {
      assert.ok(context.includes("<memory_context>"), "Should wrap in memory_context tags");
    }
  });

  it("incremental indexing adds new content (Ollama + embed required)", async (t) => {
    if (!embedAvailable) {
      t.skip("Ollama embedding not available");
      return;
    }

    const newContent = "## New Insight\n- The user wants to integrate with Notion for notes";
    const chunksAdded = await indexMemoryFile("new-insight.md", newContent, ollamaConfig, env.dbUrl);
    assert.ok(chunksAdded > 0, "Should index at least one chunk");

    const results = await searchMemory("Notion integration for notes", ollamaConfig, 5, env.dbUrl);
    const hasNotion = results.some((r) => r.content.toLowerCase().includes("notion"));
    assert.ok(hasNotion, "Should find the newly indexed Notion content");
  });

  it("handles empty memory gracefully (Ollama + embed required)", async (t) => {
    if (!embedAvailable) {
      t.skip("Ollama embedding not available");
      return;
    }

    const chunks = await indexMemoryFile("empty.md", "", ollamaConfig, env.dbUrl);
    assert.equal(chunks, 0, "Empty content should produce 0 chunks");

    const results = await searchMemory("something", ollamaConfig, 5, env.dbUrl);
    assert.ok(Array.isArray(results), "Should return array even with some empty sources");
  });
});
