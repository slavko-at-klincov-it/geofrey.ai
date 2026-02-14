import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, stat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mkdirOp, copyFileOp, moveFileOp, fileInfoOp, findFilesOp, searchReplaceOp } from "./file-ops.js";

const TMP = resolve(process.cwd(), "test-tmp-file-ops");

describe("file-ops", () => {
  beforeEach(async () => {
    await mkdir(TMP, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  describe("mkdirOp", () => {
    it("creates a directory recursively", async () => {
      const dir = resolve(TMP, "a/b/c");
      const result = await mkdirOp(dir);
      const st = await stat(dir);
      assert.ok(st.isDirectory());
      assert.ok(result.includes(dir));
    });

    it("is idempotent", async () => {
      const dir = resolve(TMP, "idem");
      await mkdirOp(dir);
      await mkdirOp(dir); // should not throw
    });
  });

  describe("copyFileOp", () => {
    it("copies a file", async () => {
      const src = resolve(TMP, "src.txt");
      const dst = resolve(TMP, "dst.txt");
      await writeFile(src, "hello");
      const result = await copyFileOp(src, dst);
      const content = await readFile(dst, "utf-8");
      assert.equal(content, "hello");
      assert.ok(result.includes("src.txt"));
    });
  });

  describe("moveFileOp", () => {
    it("moves a file", async () => {
      const src = resolve(TMP, "move-src.txt");
      const dst = resolve(TMP, "move-dst.txt");
      await writeFile(src, "data");
      await moveFileOp(src, dst);
      const content = await readFile(dst, "utf-8");
      assert.equal(content, "data");
      await assert.rejects(() => stat(src)); // source should be gone
    });
  });

  describe("fileInfoOp", () => {
    it("returns file metadata", async () => {
      const file = resolve(TMP, "info.txt");
      await writeFile(file, "test content");
      const result = await fileInfoOp(file);
      assert.ok(result.includes("Type: file"));
      assert.ok(result.includes("Size:"));
      assert.ok(result.includes("Created:"));
    });

    it("returns directory metadata", async () => {
      const dir = resolve(TMP, "info-dir");
      await mkdir(dir);
      const result = await fileInfoOp(dir);
      assert.ok(result.includes("Type: directory"));
    });
  });

  describe("findFilesOp", () => {
    it("finds files matching pattern", async () => {
      await writeFile(resolve(TMP, "foo.ts"), "");
      await writeFile(resolve(TMP, "bar.ts"), "");
      await writeFile(resolve(TMP, "baz.js"), "");
      const result = await findFilesOp(TMP, "*.ts");
      assert.ok(result.includes("foo.ts"));
      assert.ok(result.includes("bar.ts"));
      assert.ok(!result.includes("baz.js"));
    });

    it("returns no matches message", async () => {
      const result = await findFilesOp(TMP, "*.xyz");
      assert.ok(result.length > 0); // should return "no matching files" message
    });

    it("respects maxResults", async () => {
      for (let i = 0; i < 5; i++) {
        await writeFile(resolve(TMP, `file${i}.txt`), "");
      }
      const result = await findFilesOp(TMP, "*.txt", { maxResults: 2 });
      const lines = result.split("\n").filter(Boolean);
      assert.ok(lines.length <= 2);
    });
  });

  describe("searchReplaceOp", () => {
    it("replaces literal text", async () => {
      const file = resolve(TMP, "replace.txt");
      await writeFile(file, "hello world hello");
      const result = await searchReplaceOp(file, "hello", "hi");
      const content = await readFile(file, "utf-8");
      assert.equal(content, "hi world hi");
      assert.ok(result.includes("2"));
    });

    it("replaces with regex", async () => {
      const file = resolve(TMP, "regex.txt");
      await writeFile(file, "foo123bar456");
      await searchReplaceOp(file, "\\d+", "NUM", { regex: true });
      const content = await readFile(file, "utf-8");
      assert.equal(content, "fooNUMbarNUM");
    });

    it("reports no matches", async () => {
      const file = resolve(TMP, "nomatch.txt");
      await writeFile(file, "hello");
      const result = await searchReplaceOp(file, "xyz", "abc");
      assert.ok(result.includes("xyz"));
    });
  });

  describe("path confinement", () => {
    it("rejects paths outside project", async () => {
      await assert.rejects(() => mkdirOp("/tmp/evil"), /outside|außerhalb/i);
    });
  });
});
