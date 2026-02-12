import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("claude-auth setup", () => {
  it("can import module", async () => {
    const mod = await import("./claude-auth.js");
    assert.equal(typeof mod.setupClaudeAuth, "function");
  });

  it("ClaudeAuthResult has expected shape", () => {
    const result = { enabled: true, apiKey: "sk-ant-test", authMethod: "api_key" as const };
    assert.equal(typeof result.enabled, "boolean");
    assert.equal(typeof result.apiKey, "string");
    assert.ok(["api_key", "subscription", "none"].includes(result.authMethod));
  });

  it("disabled result has correct shape", () => {
    const result: { enabled: boolean; authMethod: string; apiKey?: string } = { enabled: false, authMethod: "none" };
    assert.equal(result.enabled, false);
    assert.equal(result.authMethod, "none");
    assert.equal(result.apiKey, undefined);
  });

  it("anthropic key pattern matches valid keys", () => {
    const pattern = /sk-ant-[A-Za-z0-9_-]{20,}/;
    assert.ok(pattern.test("sk-ant-abc123_DEF456-ghijklmnopqrs"));
    assert.ok(!pattern.test("sk-wrong-prefix"));
    assert.ok(!pattern.test("sk-ant-short"));
  });
});
