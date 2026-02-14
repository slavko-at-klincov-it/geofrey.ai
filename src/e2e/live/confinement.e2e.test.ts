import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

// Side-effect imports to register tools
import "../../tools/filesystem.js";
import "../../tools/shell.js";
import "../../tools/git.js";

import { getTool } from "../../tools/tool-registry.js";

describe("E2E: Filesystem & Shell Confinement", () => {
  const projectRoot = process.cwd();
  let testDir: string;
  let testFilePath: string;

  before(async () => {
    // Create a real temp directory inside the project for positive tests
    testDir = join(projectRoot, ".e2e-confinement-test-" + Date.now());
    await mkdir(testDir, { recursive: true });
    testFilePath = join(testDir, "erlaubte-datei.txt");
    await writeFile(testFilePath, "Inhalt der erlaubten Datei", "utf-8");
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("read_file rejects absolute path outside project", async () => {
    const tool = getTool("read_file");
    assert.ok(tool, "read_file tool should be registered");

    await assert.rejects(
      () => tool!.execute({ path: "/etc/hostname" }),
      (err: Error) => {
        assert.ok(
          err.message.includes("/etc/hostname") || err.message.includes("outside"),
          `Expected confinement error for /etc/hostname, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("write_file rejects path outside project", async () => {
    const tool = getTool("write_file");
    assert.ok(tool, "write_file tool should be registered");

    await assert.rejects(
      () => tool!.execute({ path: "/tmp/evil.txt", content: "boese Daten" }),
      (err: Error) => {
        assert.ok(
          err.message.includes("/tmp/evil.txt") || err.message.includes("outside"),
          `Expected confinement error for /tmp/evil.txt, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("shell_exec rejects cwd outside project", async () => {
    const tool = getTool("shell_exec");
    assert.ok(tool, "shell_exec tool should be registered");

    await assert.rejects(
      () => tool!.execute({ command: "ls", cwd: "/tmp" }),
      (err: Error) => {
        assert.ok(
          err.message.includes("/tmp") || err.message.includes("outside"),
          `Expected confinement error for cwd=/tmp, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("path traversal via .. is blocked", async () => {
    const tool = getTool("read_file");
    assert.ok(tool, "read_file tool should be registered");

    await assert.rejects(
      () => tool!.execute({ path: "../../etc/passwd" }),
      (err: Error) => {
        assert.ok(
          err.message.includes("outside") || err.message.includes("etc/passwd") || err.message.includes("Pfad"),
          `Expected confinement error for path traversal, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("git tools reject cwd outside project", async () => {
    const tool = getTool("git_status");
    assert.ok(tool, "git_status tool should be registered");

    await assert.rejects(
      () => tool!.execute({ cwd: "/tmp" }),
      (err: Error) => {
        assert.ok(
          err.message.includes("/tmp") || err.message.includes("outside"),
          `Expected confinement error for git cwd=/tmp, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("read_file works for files inside project", async () => {
    const tool = getTool("read_file");
    assert.ok(tool, "read_file tool should be registered");

    const result = await tool!.execute({ path: testFilePath });
    assert.ok(
      result.includes("Inhalt der erlaubten Datei"),
      `Expected file content, got: ${result.slice(0, 200)}`,
    );
  });
});
