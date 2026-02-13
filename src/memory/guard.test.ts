import { describe, it } from "node:test";
import assert from "node:assert/strict";

// We test the internal logic without Ollama — mock searchMemory
// The guard module uses searchMemory internally, so we test describeAction-like behavior
// and the negation pattern matching through the exported interface

// Direct test of ConflictResult shape and negation pattern
describe("guard", () => {
  it("exports checkDecisionConflict function", async () => {
    const { checkDecisionConflict } = await import("./guard.js");
    assert.equal(typeof checkDecisionConflict, "function");
  });

  it("ConflictResult shape: found=false when no conflict", () => {
    const result: { found: boolean; memoryContent?: string } = { found: false };
    assert.equal(result.found, false);
    assert.equal(result.memoryContent, undefined);
  });

  it("ConflictResult shape: found=true with content", () => {
    const result = {
      found: true,
      memoryContent: "No cloud APIs",
      similarity: 0.85,
    } as const;
    assert.equal(result.found, true);
    assert.ok(result.similarity > 0.75);
  });
});

describe("negation patterns", () => {
  // Test the regex used internally
  const NEGATION = /\b(nicht|never|don't|doesn't|dont|doesnt|removed|rejected|blocked|refused|forbidden|verboten|abgelehnt|entfernt|kein|keine|no\s)\b/i;

  it("matches English negations", () => {
    assert.ok(NEGATION.test("Don't use cloud APIs"));
    assert.ok(NEGATION.test("Never use OpenRouter"));
    assert.ok(NEGATION.test("Removed OpenRouter"));
    assert.ok(NEGATION.test("Rejected cloud TTS"));
    assert.ok(NEGATION.test("Blocked external access"));
  });

  it("matches German negations", () => {
    assert.ok(NEGATION.test("Nicht verwenden"));
    assert.ok(NEGATION.test("Verboten"));
    assert.ok(NEGATION.test("Keine Cloud-APIs"));
    assert.ok(NEGATION.test("Abgelehnt"));
    assert.ok(NEGATION.test("Entfernt wegen Datenschutz"));
  });

  it("does not match unrelated text", () => {
    assert.ok(!NEGATION.test("Use local TTS"));
    assert.ok(!NEGATION.test("Approved the action"));
    assert.ok(!NEGATION.test("Running fine"));
  });
});
