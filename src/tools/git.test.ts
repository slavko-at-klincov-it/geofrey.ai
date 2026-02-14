import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { getTool } from "./tool-registry.js";

// Import to ensure registration side-effect
import "./git.js";

describe("git tools", () => {
  it("git_status is registered", () => {
    const tool = getTool("git_status");
    assert.ok(tool);
    assert.equal(tool!.source, "native");
  });

  it("git_log is registered", () => {
    assert.ok(getTool("git_log"));
  });

  it("git_diff is registered", () => {
    assert.ok(getTool("git_diff"));
  });

  it("git_commit is registered", () => {
    assert.ok(getTool("git_commit"));
  });

  describe("with real temp git repo", () => {
    let repoDir: string;
    const originalCwd = process.cwd();

    before(async () => {
      repoDir = await mkdtemp(join(tmpdir(), "geofrey-git-test-"));
      // git init in temp dir
      await execa("git", ["init"], { cwd: repoDir });
      await execa("git", ["config", "user.email", "test@geofrey.ai"], { cwd: repoDir });
      await execa("git", ["config", "user.name", "Test"], { cwd: repoDir });

      // Create initial commit
      await writeFile(join(repoDir, "README.md"), "# Test Repo\n");
      await execa("git", ["add", "."], { cwd: repoDir });
      await execa("git", ["commit", "-m", "initial commit"], { cwd: repoDir });

      // Change cwd so confine() allows the temp dir
      process.chdir(repoDir);
    });

    after(async () => {
      process.chdir(originalCwd);
      await rm(repoDir, { recursive: true, force: true });
    });

    it("git_status returns status output", async () => {
      const result = await getTool("git_status")!.execute({ cwd: "." });
      // Clean repo → no output after commit
      assert.equal(typeof result, "string");
    });

    it("git_log returns log entries", async () => {
      const result = await getTool("git_log")!.execute({ count: 5, cwd: "." });
      assert.ok(result.includes("initial commit"), `Expected commit message, got: ${result}`);
    });

    it("git_diff returns diff output", async () => {
      // Create a change
      await writeFile(join(repoDir, "README.md"), "# Test Repo\n\nModified.\n");
      const result = await getTool("git_diff")!.execute({ staged: false, cwd: "." });
      assert.ok(result.includes("Modified"), `Expected diff content, got: ${result}`);
    });

    it("git_diff --staged returns staged changes", async () => {
      await execa("git", ["add", "README.md"], { cwd: repoDir });
      const result = await getTool("git_diff")!.execute({ staged: true, cwd: "." });
      assert.ok(result.includes("Modified"), `Expected staged diff, got: ${result}`);
    });

    it("git_commit creates a commit", async () => {
      const result = await getTool("git_commit")!.execute({ message: "test commit from unit test", cwd: "." });
      assert.ok(!result.includes("error"), `Expected clean commit, got: ${result}`);

      // Verify commit exists in log
      const log = await getTool("git_log")!.execute({ count: 1, cwd: "." });
      assert.ok(log.includes("test commit from unit test"), `Expected new commit in log, got: ${log}`);
    });

    it("git_commit with nothing to commit returns error", async () => {
      const result = await getTool("git_commit")!.execute({ message: "empty commit", cwd: "." });
      // Returns i18n "git error (...)" or "git-Fehler (...)"
      assert.ok(
        result.toLowerCase().includes("git") && (result.includes("error") || result.includes("Fehler") || result.includes("fehler")),
        `Expected git error message, got: ${result}`,
      );
    });
  });

  it("rejects cwd outside project root", async () => {
    const tool = getTool("git_status")!;
    await assert.rejects(
      () => tool.execute({ cwd: "/tmp" }),
      (err: Error) => err.message.includes("/tmp"),
    );
  });
});
