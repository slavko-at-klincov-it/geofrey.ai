import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateBuild, findFiles } from "./validator.js";

// ── Helper ─────────────────────────────────────────────────────────────────

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "validator-test-"));
}

// ── validateBuild ──────────────────────────────────────────────────────────

describe("validateBuild", () => {
  it("passes with all artifacts present", async () => {
    const dir = await makeTmpDir();
    try {
      await writeFile(join(dir, "package.json"), "{}", "utf-8");
      await writeFile(join(dir, "index.ts"), "export {};", "utf-8");
      await writeFile(join(dir, "index.test.ts"), "import 'node:test';", "utf-8");
      await writeFile(join(dir, "CLAUDE.md"), "# Project", "utf-8");

      const result = await validateBuild(dir);
      assert.equal(result.valid, true);
      assert.equal(result.checks.length, 5);
      assert.ok(result.summary.includes("5/5"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when package.json is missing", async () => {
    const dir = await makeTmpDir();
    try {
      await writeFile(join(dir, "index.ts"), "export {};", "utf-8");

      const result = await validateBuild(dir);
      assert.equal(result.valid, false);
      const pkgCheck = result.checks.find((c) => c.name === "package.json");
      assert.equal(pkgCheck?.passed, false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when no source files exist", async () => {
    const dir = await makeTmpDir();
    try {
      await writeFile(join(dir, "package.json"), "{}", "utf-8");
      await writeFile(join(dir, "README.md"), "hello", "utf-8");

      const result = await validateBuild(dir);
      assert.equal(result.valid, false);
      const srcCheck = result.checks.find((c) => c.name === "source_files");
      assert.equal(srcCheck?.passed, false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects sensitive files (.env)", async () => {
    const dir = await makeTmpDir();
    try {
      await writeFile(join(dir, "package.json"), "{}", "utf-8");
      await writeFile(join(dir, "index.ts"), "export {};", "utf-8");
      await writeFile(join(dir, ".env"), "SECRET=abc", "utf-8");

      const result = await validateBuild(dir);
      const sensitiveCheck = result.checks.find((c) => c.name === "no_sensitive_files");
      assert.equal(sensitiveCheck?.passed, false);
      assert.ok(sensitiveCheck?.detail.includes("WARNING"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("handles empty directory", async () => {
    const dir = await makeTmpDir();
    try {
      const result = await validateBuild(dir);
      assert.equal(result.valid, false);
      assert.equal(result.checks.length, 5);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ── findFiles ──────────────────────────────────────────────────────────────

describe("findFiles", () => {
  it("respects depth limit", async () => {
    const dir = await makeTmpDir();
    try {
      // depth 0 dir (root)
      await writeFile(join(dir, "root.ts"), "", "utf-8");
      // depth 1
      await mkdir(join(dir, "level1"), { recursive: true });
      await writeFile(join(dir, "level1", "a.ts"), "", "utf-8");
      // depth 2
      await mkdir(join(dir, "level1", "level2"), { recursive: true });
      await writeFile(join(dir, "level1", "level2", "b.ts"), "", "utf-8");
      // depth 3
      await mkdir(join(dir, "level1", "level2", "level3"), { recursive: true });
      await writeFile(join(dir, "level1", "level2", "level3", "c.ts"), "", "utf-8");

      // depth=1: only root files
      const depth1 = await findFiles(dir, /\.ts$/, 1);
      assert.equal(depth1.length, 1);
      assert.ok(depth1[0].endsWith("root.ts"));

      // depth=2: root + level1
      const depth2 = await findFiles(dir, /\.ts$/, 2);
      assert.equal(depth2.length, 2);

      // depth=3 (default): root + level1 + level2
      const depth3 = await findFiles(dir, /\.ts$/, 3);
      assert.equal(depth3.length, 3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("skips node_modules and dotfiles", async () => {
    const dir = await makeTmpDir();
    try {
      await writeFile(join(dir, "index.ts"), "", "utf-8");
      await mkdir(join(dir, "node_modules"), { recursive: true });
      await writeFile(join(dir, "node_modules", "dep.ts"), "", "utf-8");
      await mkdir(join(dir, ".hidden"), { recursive: true });
      await writeFile(join(dir, ".hidden", "secret.ts"), "", "utf-8");

      const found = await findFiles(dir, /\.ts$/);
      assert.equal(found.length, 1);
      assert.ok(found[0].endsWith("index.ts"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
