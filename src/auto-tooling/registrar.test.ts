import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAutoToolTask, extractProjectDir, registerAutoTool } from "./registrar.js";

// ── isAutoToolTask ─────────────────────────────────────────────────────────

describe("isAutoToolTask", () => {
  it("detects auto-tool prefix", () => {
    assert.equal(isAutoToolTask("__autotool_run__ /path/to/project"), true);
  });

  it("rejects normal tasks", () => {
    assert.equal(isAutoToolTask("send email to user"), false);
  });

  it("rejects empty string", () => {
    assert.equal(isAutoToolTask(""), false);
  });

  it("rejects partial prefix", () => {
    assert.equal(isAutoToolTask("__autotool"), false);
  });
});

// ── extractProjectDir ──────────────────────────────────────────────────────

describe("extractProjectDir", () => {
  it("extracts path from task string", () => {
    assert.equal(
      extractProjectDir("__autotool_run__ /home/user/projects/my-tool"),
      "/home/user/projects/my-tool",
    );
  });

  it("trims whitespace", () => {
    assert.equal(
      extractProjectDir("__autotool_run__   /path/to/project  "),
      "/path/to/project",
    );
  });

  it("returns empty string for prefix-only task", () => {
    assert.equal(extractProjectDir("__autotool_run__"), "");
  });
});

// ── registerAutoTool ───────────────────────────────────────────────────────

describe("registerAutoTool", () => {
  it("returns one_shot for unknown type", () => {
    const result = registerAutoTool("/tmp/project", "unknown", "chat-123");
    assert.equal(result.type, "one_shot");
    assert.equal(result.id, "manual");
    assert.ok(result.detail.includes("/tmp/project"));
  });

  it("returns one_shot for one_shot type", () => {
    const result = registerAutoTool("/tmp/project", "one_shot", "chat-456");
    assert.equal(result.type, "one_shot");
    assert.ok(result.detail.includes("npm start"));
  });
});
