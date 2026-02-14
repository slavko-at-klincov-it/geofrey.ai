import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { treeOp, dirSizeOp } from "./dir-ops.js";

const TMP = resolve(process.cwd(), "test-tmp-dir-ops");

describe("dir-ops", () => {
  beforeEach(async () => {
    await mkdir(TMP, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  describe("treeOp", () => {
    it("renders a directory tree", async () => {
      await mkdir(resolve(TMP, "src"));
      await writeFile(resolve(TMP, "src/index.ts"), "");
      await writeFile(resolve(TMP, "README.md"), "");
      const result = await treeOp(TMP);
      assert.ok(result.includes("src"));
      assert.ok(result.includes("index.ts"));
      assert.ok(result.includes("README.md"));
    });

    it("respects maxDepth", async () => {
      await mkdir(resolve(TMP, "a/b/c/d"), { recursive: true });
      await writeFile(resolve(TMP, "a/b/c/d/deep.txt"), "");
      const result = await treeOp(TMP, { maxDepth: 1 });
      assert.ok(result.includes("a"));
      assert.ok(result.includes("b"));
      assert.ok(!result.includes("deep.txt"));
    });

    it("respects maxEntries", async () => {
      for (let i = 0; i < 10; i++) {
        await writeFile(resolve(TMP, `file${i}.txt`), "");
      }
      const result = await treeOp(TMP, { maxEntries: 3 });
      assert.ok(result.includes("truncated"));
    });
  });

  describe("dirSizeOp", () => {
    it("calculates directory size", async () => {
      await writeFile(resolve(TMP, "a.txt"), "hello"); // 5 bytes
      await writeFile(resolve(TMP, "b.txt"), "world!"); // 6 bytes
      const result = await dirSizeOp(TMP);
      assert.ok(result.includes("Files: 2"));
      assert.ok(result.includes("Total size:"));
    });

    it("handles nested directories", async () => {
      await mkdir(resolve(TMP, "sub"));
      await writeFile(resolve(TMP, "sub/file.txt"), "content");
      const result = await dirSizeOp(TMP);
      assert.ok(result.includes("Files: 1"));
      assert.ok(result.includes("Directories: 1"));
    });

    it("handles empty directory", async () => {
      const result = await dirSizeOp(TMP);
      assert.ok(result.includes("Files: 0"));
      assert.ok(result.includes("Directories: 0"));
    });
  });
});
