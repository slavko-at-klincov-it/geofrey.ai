import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getTool } from "./tool-registry.js";

// Import to ensure registration side-effect
import "./filesystem.js";

describe("filesystem tools", () => {
  it("read_file is registered", () => {
    assert.ok(getTool("read_file"));
  });
  it("write_file is registered", () => {
    assert.ok(getTool("write_file"));
  });
  it("delete_file is registered", () => {
    assert.ok(getTool("delete_file"));
  });
  it("list_dir is registered", () => {
    assert.ok(getTool("list_dir"));
  });

  describe("with real temp files inside project", () => {
    // Use a temp dir INSIDE project root (process.cwd()) so confine() allows it.
    // filesystem.ts captures PROJECT_ROOT = process.cwd() at module load time.
    const testDirName = `.test-fs-${Date.now()}`;
    let testDir: string;

    before(async () => {
      testDir = join(process.cwd(), testDirName);
      await mkdir(testDir, { recursive: true });
      await writeFile(join(testDir, "hello.txt"), "Hallo Welt\n");
      await mkdir(join(testDir, "subdir"));
      await writeFile(join(testDir, "subdir", "nested.txt"), "Nested content");
    });

    after(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("read_file reads existing file", async () => {
      const result = await getTool("read_file")!.execute({ path: `${testDirName}/hello.txt` });
      assert.equal(result, "Hallo Welt\n");
    });

    it("read_file rejects path outside project", async () => {
      await assert.rejects(
        () => getTool("read_file")!.execute({ path: "/etc/passwd" }),
        (err: Error) => err.message.includes("/etc/passwd"),
      );
    });

    it("read_file fails for nonexistent file", async () => {
      await assert.rejects(
        () => getTool("read_file")!.execute({ path: `${testDirName}/nonexistent.txt` }),
      );
    });

    it("write_file creates a new file", async () => {
      const result = await getTool("write_file")!.execute({ path: `${testDirName}/new.txt`, content: "Neuer Inhalt" });
      assert.ok(result.includes("new.txt"), `Expected path in response, got: ${result}`);

      // Verify content
      const content = await getTool("read_file")!.execute({ path: `${testDirName}/new.txt` });
      assert.equal(content, "Neuer Inhalt");
    });

    it("write_file overwrites existing file", async () => {
      await getTool("write_file")!.execute({ path: `${testDirName}/hello.txt`, content: "Updated" });
      const content = await getTool("read_file")!.execute({ path: `${testDirName}/hello.txt` });
      assert.equal(content, "Updated");
    });

    it("write_file rejects path outside project", async () => {
      await assert.rejects(
        () => getTool("write_file")!.execute({ path: "/tmp/evil.txt", content: "hack" }),
        (err: Error) => err.message.includes("/tmp/evil.txt"),
      );
    });

    it("delete_file removes a file", async () => {
      await getTool("write_file")!.execute({ path: `${testDirName}/to-delete.txt`, content: "bye" });
      const result = await getTool("delete_file")!.execute({ path: `${testDirName}/to-delete.txt` });
      assert.ok(result.includes("to-delete.txt"));

      // Verify deletion
      await assert.rejects(
        () => getTool("read_file")!.execute({ path: `${testDirName}/to-delete.txt` }),
      );
    });

    it("delete_file fails for nonexistent file", async () => {
      await assert.rejects(
        () => getTool("delete_file")!.execute({ path: `${testDirName}/ghost.txt` }),
      );
    });

    it("list_dir lists directory contents", async () => {
      const result = await getTool("list_dir")!.execute({ path: testDirName });
      assert.ok(result.includes("hello.txt"), `Expected hello.txt in listing, got: ${result}`);
      assert.ok(result.includes("subdir"), `Expected subdir in listing, got: ${result}`);
    });

    it("list_dir shows file type prefixes", async () => {
      const result = await getTool("list_dir")!.execute({ path: testDirName });
      assert.ok(result.includes("d subdir"), `Expected 'd subdir', got: ${result}`);
    });

    it("list_dir reads nested directory", async () => {
      const result = await getTool("list_dir")!.execute({ path: `${testDirName}/subdir` });
      assert.ok(result.includes("nested.txt"), `Expected nested.txt, got: ${result}`);
    });

    it("path traversal with .. is blocked", async () => {
      await assert.rejects(
        () => getTool("read_file")!.execute({ path: "../../../etc/passwd" }),
        (err: Error) => err.message.length > 0,
      );
    });
  });
});
