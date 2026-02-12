import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyDeterministic, tryParseClassification, RiskLevel } from "./risk-classifier.js";

describe("classifyDeterministic", () => {
  it("classifies L0 tools", () => {
    for (const tool of ["read_file", "list_dir", "search", "git_status", "git_log", "git_diff"]) {
      const r = classifyDeterministic(tool, {});
      assert.equal(r?.level, RiskLevel.L0);
      assert.equal(r?.deterministic, true);
    }
  });

  it("classifies L3 commands", () => {
    const r = classifyDeterministic("shell_exec", { command: "sudo rm -rf /" });
    assert.equal(r?.level, RiskLevel.L3);
  });

  it("detects injection patterns", () => {
    const r = classifyDeterministic("shell_exec", { command: "echo $(cat /etc/passwd)" });
    assert.equal(r?.level, RiskLevel.L3);
    assert.ok(r?.reason.includes("Injection"));
  });

  it("detects force push", () => {
    const r = classifyDeterministic("git_push", { command: "git push --force origin main" });
    assert.equal(r?.level, RiskLevel.L3);
  });

  it("detects sensitive paths", () => {
    const r = classifyDeterministic("write_file", { path: "/home/user/.env" });
    assert.equal(r?.level, RiskLevel.L3);
  });

  it("detects config files", () => {
    for (const path of ["package.json", "tsconfig.json", "Dockerfile", ".eslintrc", ".prettierrc", ".github/workflows/ci.yml"]) {
      const r = classifyDeterministic("write_file", { path });
      assert.equal(r?.level, RiskLevel.L2, `expected L2 for ${path}`);
    }
  });

  it("returns null for ambiguous cases", () => {
    const r = classifyDeterministic("write_file", { path: "src/index.ts" });
    assert.equal(r, null);
  });

  it("returns null for empty args", () => {
    const r = classifyDeterministic("unknown_tool", {});
    assert.equal(r, null);
  });
});

describe("tryParseClassification", () => {
  it("parses valid JSON", () => {
    const r = tryParseClassification('{"level":"L2","reason":"test"}');
    assert.deepEqual(r, { level: RiskLevel.L2, reason: "test" });
  });

  it("returns null for invalid JSON", () => {
    const r = tryParseClassification("not json at all");
    assert.equal(r, null);
  });

  it("extracts JSON from markdown fences", () => {
    const r = tryParseClassification('```json\n{"level":"L1","reason":"safe"}\n```');
    assert.deepEqual(r, { level: RiskLevel.L1, reason: "safe" });
  });

  it("extracts JSON from thinking tags", () => {
    const r = tryParseClassification('<think>analysis</think>\n{"level":"L0","reason":"read only"}');
    assert.deepEqual(r, { level: RiskLevel.L0, reason: "read only" });
  });

  it("returns null for invalid level", () => {
    const r = tryParseClassification('{"level":"L5","reason":"test"}');
    assert.equal(r, null);
  });

  it("provides default reason when missing", () => {
    const r = tryParseClassification('{"level":"L2"}');
    assert.equal(r?.reason, "Keine Begründung");
  });
});
