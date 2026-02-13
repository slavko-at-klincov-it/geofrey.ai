import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterOutput, containsCredentials } from "./output-filter.js";

// --- filterOutput ---

describe("filterOutput", () => {
  it("redacts Anthropic API keys (sk-ant-xxx)", () => {
    const text = "Use key sk-ant-api03-abcdefghijklmnopqrstuvwx to call the API";
    const result = filterOutput(text);

    assert.ok(!result.text.includes("sk-ant-api03"), "API key should be redacted");
    assert.ok(result.text.includes("[REDACTED]"));
    assert.ok(result.redactedCount >= 1);
  });

  it("redacts generic sk- API keys", () => {
    const text = "My key is sk-1234567890abcdefghijklmn";
    const result = filterOutput(text);

    assert.ok(!result.text.includes("sk-1234567890"), "sk- key should be redacted");
    assert.ok(result.text.includes("[REDACTED]"));
  });

  it("redacts GitHub personal access tokens (ghp_xxx)", () => {
    const text = "Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const result = filterOutput(text);

    assert.ok(!result.text.includes("ghp_"), "GitHub token should be redacted");
    assert.ok(result.text.includes("[REDACTED]"));
  });

  it("redacts AWS access key IDs (AKIA)", () => {
    const text = "AWS key: AKIAIOSFODNN7EXAMPLE";
    const result = filterOutput(text);

    assert.ok(!result.text.includes("AKIAIOSFODNN7EXAMPLE"), "AWS key should be redacted");
    assert.ok(result.text.includes("[REDACTED]"));
  });

  it("redacts Bearer tokens", () => {
    const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0";
    const result = filterOutput(text);

    assert.ok(!result.text.includes("eyJhbGciOiJIUzI1NiI"), "Bearer token should be redacted");
    assert.ok(result.text.includes("[REDACTED]"));
  });

  it("redacts database connection strings with passwords", () => {
    const text = "DB: postgres://admin:s3cretP4ss!@db.acme.com:5432/production";
    const result = filterOutput(text);

    assert.ok(!result.text.includes("s3cretP4ss!"), "Connection string password should be redacted");
    assert.ok(result.text.includes("[REDACTED]"));
  });

  it("does NOT redact short strings", () => {
    const text = "The password is abc123";
    const result = filterOutput(text);

    // "abc123" is too short (< 16 chars) to be treated as a secret
    assert.equal(result.redactedCount, 0, "short values should not be redacted");
  });

  it("does NOT redact pure hex strings", () => {
    // A SHA-256 hash is 64 hex chars — should not be treated as a secret
    const hex = "a".repeat(64);
    const text = `Commit hash: ${hex}`;
    const result = filterOutput(text);

    assert.ok(result.text.includes(hex), "pure hex should not be redacted");
  });

  it("does NOT redact pure alphabetic strings", () => {
    const alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL";
    const text = `Variable: ${alpha}`;
    const result = filterOutput(text);

    assert.ok(result.text.includes(alpha), "pure alphabetic should not be redacted");
  });

  it("handles text with no credentials (unchanged)", () => {
    const text = "This is a normal response with no secrets at all.";
    const result = filterOutput(text);

    assert.equal(result.text, text);
    assert.equal(result.redactedCount, 0);
    assert.equal(result.redactedPatterns.length, 0);
  });

  it("returns correct redactedCount for multiple credentials", () => {
    const text = [
      "Key1: sk-ant-api03-abcdefghijklmnopqrstuvwx",
      "Key2: ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    ].join("\n");
    const result = filterOutput(text);

    assert.ok(result.redactedCount >= 2, `expected >=2 redactions, got ${result.redactedCount}`);
  });

  it("redacts Slack tokens (xoxb-xxx)", () => {
    const text = "Slack: xoxb-0000000fake-0000000fake0-FaKeToKeNvAlUeHeReXxYy";
    const result = filterOutput(text);

    assert.ok(!result.text.includes("xoxb-"), "Slack token should be redacted");
    assert.ok(result.text.includes("[REDACTED]"));
  });
});

// --- containsCredentials ---

describe("containsCredentials", () => {
  it("returns true for text containing an API key", () => {
    const text = "Config: sk-ant-api03-abcdefghijklmnopqrstuvwx";
    assert.equal(containsCredentials(text), true);
  });

  it("returns true for text containing a GitHub token", () => {
    const text = "Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    assert.equal(containsCredentials(text), true);
  });

  it("returns false for clean text", () => {
    const text = "Everything looks good. Deployment complete.";
    assert.equal(containsCredentials(text), false);
  });

  it("returns false for short potential matches", () => {
    const text = "The token is abc";
    assert.equal(containsCredentials(text), false);
  });

  it("returns true for connection string with credentials", () => {
    const text = "postgres://user:longpassword123@db.host.com/dbname";
    assert.equal(containsCredentials(text), true);
  });
});
