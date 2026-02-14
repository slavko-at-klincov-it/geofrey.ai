import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { textStatsOp, headOp, tailOp, diffFilesOp, sortLinesOp, base64Op, countLinesOp } from "./text-ops.js";

const TMP = resolve(process.cwd(), "test-tmp-text-ops");

describe("text-ops", () => {
  beforeEach(async () => {
    await mkdir(TMP, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  describe("textStatsOp", () => {
    it("returns line, word, char counts", async () => {
      const file = resolve(TMP, "stats.txt");
      await writeFile(file, "hello world\nfoo bar baz\n");
      const result = await textStatsOp(file);
      assert.ok(result.includes("Lines: 3"));
      assert.ok(result.includes("Words: 5"));
    });
  });

  describe("headOp", () => {
    it("returns first N lines", async () => {
      const file = resolve(TMP, "head.txt");
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
      await writeFile(file, lines.join("\n"));
      const result = await headOp(file, 5);
      assert.equal(result, "line 1\nline 2\nline 3\nline 4\nline 5");
    });

    it("defaults to 10 lines", async () => {
      const file = resolve(TMP, "head-default.txt");
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
      await writeFile(file, lines.join("\n"));
      const result = await headOp(file);
      assert.equal(result.split("\n").length, 10);
    });
  });

  describe("tailOp", () => {
    it("returns last N lines", async () => {
      const file = resolve(TMP, "tail.txt");
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
      await writeFile(file, lines.join("\n"));
      const result = await tailOp(file, 3);
      assert.equal(result, "line 18\nline 19\nline 20");
    });
  });

  describe("diffFilesOp", () => {
    it("shows differences between files", async () => {
      const a = resolve(TMP, "a.txt");
      const b = resolve(TMP, "b.txt");
      await writeFile(a, "line1\nline2\nline3");
      await writeFile(b, "line1\nchanged\nline3");
      const result = await diffFilesOp(a, b);
      assert.ok(result.includes("1 differences"));
      assert.ok(result.includes("line2"));
      assert.ok(result.includes("changed"));
    });

    it("reports identical files", async () => {
      const a = resolve(TMP, "same1.txt");
      const b = resolve(TMP, "same2.txt");
      await writeFile(a, "same content");
      await writeFile(b, "same content");
      const result = await diffFilesOp(a, b);
      assert.ok(result.toLowerCase().includes("identical") || result.toLowerCase().includes("identisch"));
    });
  });

  describe("sortLinesOp", () => {
    it("sorts lines alphabetically", async () => {
      const file = resolve(TMP, "sort.txt");
      await writeFile(file, "cherry\napple\nbanana");
      const result = await sortLinesOp(file);
      assert.equal(result, "apple\nbanana\ncherry");
    });

    it("sorts numerically", async () => {
      const file = resolve(TMP, "sort-num.txt");
      await writeFile(file, "10\n2\n100\n1");
      const result = await sortLinesOp(file, { numeric: true });
      assert.equal(result, "1\n2\n10\n100");
    });

    it("sorts in reverse", async () => {
      const file = resolve(TMP, "sort-rev.txt");
      await writeFile(file, "a\nb\nc");
      const result = await sortLinesOp(file, { reverse: true });
      assert.equal(result, "c\nb\na");
    });
  });

  describe("base64Op", () => {
    it("encodes to base64", async () => {
      const result = await base64Op("Hello, World!", "encode");
      assert.equal(result, "SGVsbG8sIFdvcmxkIQ==");
    });

    it("decodes from base64", async () => {
      const result = await base64Op("SGVsbG8sIFdvcmxkIQ==", "decode");
      assert.equal(result, "Hello, World!");
    });

    it("round-trips correctly", async () => {
      const original = "Test with special chars: äöü €";
      const encoded = await base64Op(original, "encode");
      const decoded = await base64Op(encoded, "decode");
      assert.equal(decoded, original);
    });
  });

  describe("countLinesOp", () => {
    it("counts lines in a file", async () => {
      const file = resolve(TMP, "count.txt");
      await writeFile(file, "a\nb\nc\nd\n");
      const result = await countLinesOp(file);
      assert.ok(result.includes("5"));
    });
  });
});
