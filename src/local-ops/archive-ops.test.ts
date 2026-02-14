import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { archiveCreateOp, archiveExtractOp } from "./archive-ops.js";

const TMP = resolve(process.cwd(), "test-tmp-archive-ops");

describe("archive-ops", () => {
  beforeEach(async () => {
    await mkdir(TMP, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  describe("archiveCreateOp + archiveExtractOp round-trip", () => {
    it("archives and extracts a directory", async () => {
      // Create source directory with files
      const srcDir = resolve(TMP, "source");
      await mkdir(resolve(srcDir, "sub"), { recursive: true });
      await writeFile(resolve(srcDir, "hello.txt"), "Hello, World!");
      await writeFile(resolve(srcDir, "sub/nested.txt"), "Nested content");

      // Create archive
      const archivePath = resolve(TMP, "test.tar.gz");
      const createResult = await archiveCreateOp([srcDir], archivePath);
      assert.ok(createResult.includes("test.tar.gz"));

      // Verify archive exists
      const archiveStat = await stat(archivePath);
      assert.ok(archiveStat.size > 0);

      // Extract archive
      const destDir = resolve(TMP, "extracted");
      const extractResult = await archiveExtractOp(archivePath, destDir);
      assert.ok(extractResult.includes("extracted"));

      // Verify extracted files
      const helloContent = await readFile(resolve(destDir, "source/hello.txt"), "utf-8");
      assert.equal(helloContent, "Hello, World!");

      const nestedContent = await readFile(resolve(destDir, "source/sub/nested.txt"), "utf-8");
      assert.equal(nestedContent, "Nested content");
    });

    it("archives single files", async () => {
      const file = resolve(TMP, "single.txt");
      await writeFile(file, "single file content");

      const archivePath = resolve(TMP, "single.tar.gz");
      await archiveCreateOp([file], archivePath);

      const destDir = resolve(TMP, "extracted-single");
      await archiveExtractOp(archivePath, destDir);

      const content = await readFile(resolve(destDir, "single.txt"), "utf-8");
      assert.equal(content, "single file content");
    });
  });

  describe("path confinement", () => {
    it("rejects archive path outside project", async () => {
      await assert.rejects(
        () => archiveCreateOp([resolve(TMP, "src")], "/tmp/evil.tar.gz"),
        /outside|außerhalb/i,
      );
    });

    it("rejects extraction path outside project", async () => {
      const archivePath = resolve(TMP, "test.tar.gz");
      await writeFile(archivePath, Buffer.alloc(0));
      await assert.rejects(
        () => archiveExtractOp(archivePath, "/tmp/evil-dest"),
        /outside|außerhalb/i,
      );
    });
  });
});
