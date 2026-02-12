import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePrompt, buildClaudeCodePrompt, scopeToolsForRisk } from "./prompt-generator.js";
import { RiskLevel } from "../approval/risk-classifier.js";

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

  it("generates prompt for code_review template", () => {
    const result = generatePrompt("code_review", { files: "src/index.ts", focus: "security" });
    assert.ok(result.includes("Review the code"));
    assert.ok(result.includes("security"));
  });

  it("generates prompt for test_writing template", () => {
    const result = generatePrompt("test_writing", { files: "src/utils.ts", framework: "node:test" });
    assert.ok(result.includes("Write tests"));
  });

  it("generates prompt for debugging template", () => {
    const result = generatePrompt("debugging", { error: "ENOENT", files: "src/db.ts", steps: "run npm test" });
    assert.ok(result.includes("Investigate"));
    assert.ok(result.includes("ENOENT"));
  });

  it("generates prompt for freeform template", () => {
    const result = generatePrompt("freeform", { request: "optimize this", files: "src/hot.ts" });
    assert.ok(result.includes("optimize this"));
  });
});

describe("scopeToolsForRisk", () => {
  const profiles = {
    readOnly: "Read Glob Grep",
    standard: "Read Glob Grep Edit Write Bash(git:*)",
    full: "Read Glob Grep Edit Write Bash",
  };

  it("maps L0 to readOnly", () => {
    assert.equal(scopeToolsForRisk(RiskLevel.L0, profiles), profiles.readOnly);
  });

  it("maps L1 to standard", () => {
    assert.equal(scopeToolsForRisk(RiskLevel.L1, profiles), profiles.standard);
  });

  it("maps L2 to full", () => {
    assert.equal(scopeToolsForRisk(RiskLevel.L2, profiles), profiles.full);
  });

  it("maps L3 to full", () => {
    assert.equal(scopeToolsForRisk(RiskLevel.L3, profiles), profiles.full);
  });
});

describe("buildClaudeCodePrompt", () => {
  it("returns prompt, allowedTools, and systemPrompt", () => {
    const result = buildClaudeCodePrompt({
      intent: "fix",
      request: "fix the login bug",
      files: "src/auth.ts",
      error: "TypeError",
    });
    assert.ok(result.prompt.includes("TypeError"));
    assert.ok(result.allowedTools.length > 0);
    assert.ok(result.systemPrompt.length > 0);
  });

  it("uses debugging template when intent is debugging", () => {
    const result = buildClaudeCodePrompt({
      intent: "debugging",
      request: "find the bug",
      error: "ENOENT",
    });
    assert.ok(result.prompt.includes("Investigate"));
  });

  it("uses freeform template for unknown intents", () => {
    const result = buildClaudeCodePrompt({
      intent: "unknown_intent",
      request: "do something",
    });
    assert.ok(result.prompt.includes("do something"));
  });

  it("scopes tools based on risk level", () => {
    const l0 = buildClaudeCodePrompt({ intent: "review", request: "review", riskLevel: RiskLevel.L0 });
    assert.equal(l0.allowedTools, "Read Glob Grep");

    const l1 = buildClaudeCodePrompt({ intent: "fix", request: "fix", riskLevel: RiskLevel.L1 });
    assert.ok(l1.allowedTools.includes("Edit"));
  });
});
