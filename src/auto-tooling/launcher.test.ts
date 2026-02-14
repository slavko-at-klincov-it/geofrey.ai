import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { projectSlug, projectPath, scaffoldProject } from "./launcher.js";

// ── projectSlug ────────────────────────────────────────────────────────────

describe("projectSlug", () => {
  it("generates clean slug from simple name", () => {
    assert.equal(projectSlug("My Tool"), "my-tool");
  });

  it("handles special characters", () => {
    assert.equal(projectSlug("Hello World! @#$"), "hello-world");
  });

  it("truncates long names to 50 chars", () => {
    const long = "a".repeat(100);
    const slug = projectSlug(long);
    assert.ok(slug.length <= 50);
    assert.equal(slug, "a".repeat(50));
  });

  it("strips leading and trailing hyphens", () => {
    assert.equal(projectSlug("--test--"), "test");
  });

  it("collapses consecutive special chars to single hyphen", () => {
    assert.equal(projectSlug("foo   bar___baz"), "foo-bar-baz");
  });
});

// ── projectPath ────────────────────────────────────────────────────────────

describe("projectPath", () => {
  it("returns correct path under .geofrey/projects", () => {
    const result = projectPath("my-tool");
    assert.equal(result, join(process.cwd(), ".geofrey/projects", "my-tool"));
  });

  it("includes cwd as base", () => {
    const result = projectPath("test");
    assert.ok(result.startsWith(process.cwd()));
  });
});

// ── scaffoldProject ────────────────────────────────────────────────────────

describe("scaffoldProject", () => {
  it("creates directory and writes CLAUDE.md", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "launcher-test-"));
    const projectDir = join(tmpDir, "test-project");

    try {
      await scaffoldProject(projectDir, "# Test\nHello");
      const content = await readFile(join(projectDir, "CLAUDE.md"), "utf-8");
      assert.equal(content, "# Test\nHello");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates nested directories recursively", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "launcher-test-"));
    const projectDir = join(tmpDir, "deep", "nested", "project");

    try {
      await scaffoldProject(projectDir, "content");
      const content = await readFile(join(projectDir, "CLAUDE.md"), "utf-8");
      assert.equal(content, "content");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
