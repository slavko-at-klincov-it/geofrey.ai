import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeSha256, verifyHash, parseChecksumFile } from "./verification.js";

describe("skills/verification - computeSha256", () => {
  it("computes SHA-256 hash of a string", () => {
    // Known SHA-256 for empty string
    const hash = computeSha256("");
    assert.equal(hash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("computes consistent hash for the same input", () => {
    const input = "Hello, world!";
    const hash1 = computeSha256(input);
    const hash2 = computeSha256(input);
    assert.equal(hash1, hash2);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = computeSha256("foo");
    const hash2 = computeSha256("bar");
    assert.notEqual(hash1, hash2);
  });

  it("returns lowercase hex string of 64 characters", () => {
    const hash = computeSha256("test content");
    assert.equal(hash.length, 64);
    assert.ok(/^[a-f0-9]{64}$/.test(hash));
  });

  it("handles multi-line content", () => {
    const content = "line one\nline two\nline three";
    const hash = computeSha256(content);
    assert.equal(hash.length, 64);
    assert.ok(/^[a-f0-9]{64}$/.test(hash));
  });

  it("handles unicode content", () => {
    const content = "Hallo Welt! 🌍 日本語";
    const hash = computeSha256(content);
    assert.equal(hash.length, 64);
    assert.ok(/^[a-f0-9]{64}$/.test(hash));
  });
});

describe("skills/verification - verifyHash", () => {
  it("returns valid for matching hash", () => {
    const content = "test content";
    const hash = computeSha256(content);
    const result = verifyHash(content, hash);
    assert.equal(result.valid, true);
  });

  it("returns invalid for mismatched hash", () => {
    const content = "test content";
    const wrongHash = "a".repeat(64);
    const result = verifyHash(content, wrongHash);
    assert.equal(result.valid, false);
    assert.ok("reason" in result);
    assert.ok(result.reason.includes("Hash mismatch"));
  });

  it("returns invalid for malformed hash", () => {
    const result = verifyHash("content", "not-a-hash");
    assert.equal(result.valid, false);
    assert.ok("reason" in result);
    assert.ok(result.reason.includes("Invalid SHA-256 hash format"));
  });

  it("returns invalid for hash that is too short", () => {
    const result = verifyHash("content", "abcdef");
    assert.equal(result.valid, false);
    assert.ok("reason" in result);
    assert.ok(result.reason.includes("Invalid SHA-256 hash format"));
  });

  it("returns invalid for hash with non-hex characters", () => {
    const hash = "g".repeat(64);
    const result = verifyHash("content", hash);
    assert.equal(result.valid, false);
    assert.ok("reason" in result);
  });

  it("handles uppercase expected hash", () => {
    const content = "test content";
    const hash = computeSha256(content).toUpperCase();
    const result = verifyHash(content, hash);
    assert.equal(result.valid, true);
  });

  it("trims whitespace from expected hash", () => {
    const content = "test content";
    const hash = `  ${computeSha256(content)}  \n`;
    const result = verifyHash(content, hash);
    assert.equal(result.valid, true);
  });
});

describe("skills/verification - parseChecksumFile", () => {
  it("parses bare hash", () => {
    const hash = "a".repeat(64);
    assert.equal(parseChecksumFile(hash), hash);
  });

  it("parses hash with trailing newline", () => {
    const hash = "b".repeat(64);
    assert.equal(parseChecksumFile(`${hash}\n`), hash);
  });

  it("parses sha256sum format (hash  filename)", () => {
    const hash = "c".repeat(64);
    assert.equal(parseChecksumFile(`${hash}  SKILL.md`), hash);
  });

  it("parses sha256sum format with single space", () => {
    const hash = "d".repeat(64);
    assert.equal(parseChecksumFile(`${hash} SKILL.md\n`), hash);
  });

  it("normalizes uppercase hash to lowercase", () => {
    const hash = "ABCDEF0123456789".repeat(4);
    const result = parseChecksumFile(hash);
    assert.equal(result, hash.toLowerCase());
  });

  it("returns null for invalid content", () => {
    assert.equal(parseChecksumFile("not a hash"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(parseChecksumFile(""), null);
  });

  it("returns null for hash that is too short", () => {
    assert.equal(parseChecksumFile("abcdef"), null);
  });

  it("returns null for hash with non-hex characters", () => {
    assert.equal(parseChecksumFile("g".repeat(64)), null);
  });
});
