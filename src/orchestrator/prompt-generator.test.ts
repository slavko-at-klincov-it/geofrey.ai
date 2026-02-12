import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePrompt } from "./prompt-generator.js";

describe("generatePrompt", () => {
  it("generates prompt for valid template (bug_fix)", () => {
    const result = generatePrompt("bug_fix", {
      error: "TypeError: x is undefined",
      files: "src/index.ts",
      expected: "no error",
    });
    assert.ok(result.includes("<context>"));
    assert.ok(result.includes("<task>"));
    assert.ok(result.includes("<constraints>"));
    assert.ok(result.includes("TypeError"));
  });

  it("returns fallback JSON for unknown template", () => {
    const result = generatePrompt("nonexistent", { foo: "bar" });
    assert.ok(result.includes("Task:"));
    assert.ok(result.includes("foo"));
  });

  it("output contains all XML tags", () => {
    const result = generatePrompt("refactor", {
      currentCode: "old",
      targetPattern: "new",
      files: "src/a.ts",
    });
    for (const tag of ["context", "task", "constraints", "respond_with"]) {
      assert.ok(result.includes(`<${tag}>`), `missing <${tag}>`);
      assert.ok(result.includes(`</${tag}>`), `missing </${tag}>`);
    }
  });
});
