import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkText, cosineSimilarity } from "./embeddings.js";

describe("chunkText", () => {
  it("returns single chunk for short text", () => {
    const chunks = chunkText("Hello world");
    assert.deepEqual(chunks, ["Hello world"]);
  });

  it("returns empty array for empty text", () => {
    const chunks = chunkText("");
    assert.deepEqual(chunks, []);
  });

  it("returns empty array for whitespace-only text", () => {
    const chunks = chunkText("   \n\n   ");
    assert.deepEqual(chunks, []);
  });

  it("splits on paragraph boundaries", () => {
    const para1 = "First paragraph with some content.";
    const para2 = "Second paragraph with different content.";
    const text = `${para1}\n\n${para2}`;

    // Use a small maxTokens to force split
    const chunks = chunkText(text, 10); // 10 tokens = ~40 chars
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0], para1);
    assert.equal(chunks[1], para2);
  });

  it("keeps paragraphs together when under limit", () => {
    const text = "Short para 1.\n\nShort para 2.";
    const chunks = chunkText(text, 100); // 100 tokens = ~400 chars, plenty
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].includes("Short para 1."));
    assert.ok(chunks[0].includes("Short para 2."));
  });

  it("splits long paragraphs on sentences", () => {
    // Create a paragraph longer than maxTokens * 4 chars
    const sentences = Array.from({ length: 20 }, (_, i) => `This is sentence number ${i + 1}.`);
    const longPara = sentences.join(" ");
    const chunks = chunkText(longPara, 20); // 20 tokens = ~80 chars
    assert.ok(chunks.length > 1, `Expected multiple chunks, got ${chunks.length}`);
    // Each chunk should not exceed ~80 chars (approximately)
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 120, `Chunk too long: ${chunk.length} chars`);
    }
  });

  it("respects default max token limit (~400 tokens)", () => {
    // 400 tokens * 4 chars = 1600 chars; create text with paragraph breaks
    const para = "This is a paragraph. ".repeat(40); // ~840 chars each
    const text = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkText(text);
    assert.ok(chunks.length >= 2, `Expected at least 2 chunks, got ${chunks.length}`);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    const sim = cosineSimilarity(v, v);
    assert.ok(Math.abs(sim - 1.0) < 1e-10);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const sim = cosineSimilarity(a, b);
    assert.ok(Math.abs(sim) < 1e-10);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    const sim = cosineSimilarity(a, b);
    assert.ok(Math.abs(sim + 1.0) < 1e-10);
  });

  it("returns 0 for empty vectors", () => {
    const sim = cosineSimilarity([], []);
    assert.equal(sim, 0);
  });

  it("returns 0 for mismatched lengths", () => {
    const sim = cosineSimilarity([1, 2], [1, 2, 3]);
    assert.equal(sim, 0);
  });

  it("returns 0 for zero vectors", () => {
    const sim = cosineSimilarity([0, 0, 0], [0, 0, 0]);
    assert.equal(sim, 0);
  });

  it("handles normalized vectors correctly", () => {
    const a = [1 / Math.sqrt(2), 1 / Math.sqrt(2)];
    const b = [1, 0];
    const sim = cosineSimilarity(a, b);
    assert.ok(Math.abs(sim - 1 / Math.sqrt(2)) < 1e-10);
  });
});
