import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseFile } from "./parser.js";
import { generateSummary, deriveCategory } from "./summary.js";
import { runIndexer, loadProjectMap } from "./index.js";

// ── parseFile: exports ──────────────────────────────────────────────────────

describe("parseFile exports", () => {
  it("extracts exported function", () => {
    const result = parseFile('export function foo() {}', "test.ts");
    assert.equal(result.exports.length, 1);
    assert.equal(result.exports[0].name, "foo");
    assert.equal(result.exports[0].kind, "function");
    assert.equal(result.exports[0].isDefault, false);
  });

  it("extracts exported class", () => {
    const result = parseFile('export class MyClass {}', "test.ts");
    assert.equal(result.exports.length, 1);
    assert.equal(result.exports[0].name, "MyClass");
    assert.equal(result.exports[0].kind, "class");
  });

  it("extracts exported const", () => {
    const result = parseFile('export const MAX = 10;', "test.ts");
    assert.equal(result.exports.length, 1);
    assert.equal(result.exports[0].name, "MAX");
    assert.equal(result.exports[0].kind, "const");
  });

  it("extracts exported let", () => {
    const result = parseFile('export let counter = 0;', "test.ts");
    assert.equal(result.exports[0].kind, "let");
  });

  it("extracts exported type", () => {
    const result = parseFile('export type Foo = string;', "test.ts");
    assert.equal(result.exports[0].name, "Foo");
    assert.equal(result.exports[0].kind, "type");
  });

  it("extracts exported interface", () => {
    const result = parseFile('export interface Bar { x: number; }', "test.ts");
    assert.equal(result.exports[0].name, "Bar");
    assert.equal(result.exports[0].kind, "interface");
  });

  it("extracts exported enum", () => {
    const result = parseFile('export enum Color { Red, Green }', "test.ts");
    assert.equal(result.exports[0].name, "Color");
    assert.equal(result.exports[0].kind, "enum");
  });

  it("extracts default export", () => {
    const result = parseFile('export default function main() {}', "test.ts");
    assert.equal(result.exports[0].name, "main");
    assert.equal(result.exports[0].isDefault, true);
  });

  it("extracts export default expression", () => {
    const result = parseFile('const x = 1;\nexport default x;', "test.ts");
    assert.equal(result.exports[0].name, "x");
    assert.equal(result.exports[0].kind, "default");
    assert.equal(result.exports[0].isDefault, true);
  });

  it("extracts re-exports", () => {
    const result = parseFile('export { foo, bar } from "./other.js";', "test.ts");
    assert.equal(result.exports.length, 2);
    assert.equal(result.exports[0].kind, "re-export");
    assert.equal(result.exports[1].kind, "re-export");
  });

  it("extracts star re-export", () => {
    const result = parseFile('export * from "./other.js";', "test.ts");
    assert.equal(result.exports.length, 1);
    assert.equal(result.exports[0].name, "*");
    assert.equal(result.exports[0].kind, "re-export");
  });

  it("extracts multiple const exports", () => {
    const result = parseFile('export const A = 1, B = 2;', "test.ts");
    assert.equal(result.exports.length, 2);
    assert.equal(result.exports[0].name, "A");
    assert.equal(result.exports[1].name, "B");
  });

  it("returns empty exports for no exports", () => {
    const result = parseFile('const x = 1;', "test.ts");
    assert.equal(result.exports.length, 0);
  });
});

// ── parseFile: imports ──────────────────────────────────────────────────────

describe("parseFile imports", () => {
  it("extracts named import", () => {
    const result = parseFile('import { readFile } from "node:fs/promises";', "test.ts");
    assert.equal(result.imports.length, 1);
    assert.equal(result.imports[0].source, "node:fs/promises");
    assert.deepEqual(result.imports[0].specifiers, ["readFile"]);
    assert.equal(result.imports[0].isTypeOnly, false);
  });

  it("extracts namespace import", () => {
    const result = parseFile('import * as fs from "node:fs";', "test.ts");
    assert.deepEqual(result.imports[0].specifiers, ["*"]);
  });

  it("extracts default import", () => {
    const result = parseFile('import ts from "typescript";', "test.ts");
    assert.deepEqual(result.imports[0].specifiers, ["ts"]);
  });

  it("extracts type-only import", () => {
    const result = parseFile('import type { Config } from "./config.js";', "test.ts");
    assert.equal(result.imports[0].isTypeOnly, true);
  });

  it("extracts bare import", () => {
    const result = parseFile('import "./side-effect.js";', "test.ts");
    assert.equal(result.imports[0].source, "./side-effect.js");
    assert.deepEqual(result.imports[0].specifiers, ["*"]);
  });

  it("extracts multiple imports", () => {
    const code = `
import { a } from "./a.js";
import { b } from "./b.js";
`;
    const result = parseFile(code, "test.ts");
    assert.equal(result.imports.length, 2);
  });
});

// ── parseFile: leading comment ──────────────────────────────────────────────

describe("parseFile leading comment", () => {
  it("extracts JSDoc comment", () => {
    const code = `/** Entry point for the application */\nexport function main() {}`;
    const result = parseFile(code, "test.ts");
    assert.equal(result.leadingComment, "Entry point for the application");
  });

  it("extracts block comment", () => {
    const code = `/* Helper utilities */\nexport const x = 1;`;
    const result = parseFile(code, "test.ts");
    assert.equal(result.leadingComment, "Helper utilities");
  });

  it("extracts line comment", () => {
    const code = `// Config defaults\nexport const x = 1;`;
    const result = parseFile(code, "test.ts");
    assert.equal(result.leadingComment, "Config defaults");
  });

  it("truncates long comments to 120 chars", () => {
    const long = "A".repeat(200);
    const code = `/** ${long} */\nexport const x = 1;`;
    const result = parseFile(code, "test.ts");
    assert.ok(result.leadingComment!.length <= 120);
    assert.ok(result.leadingComment!.endsWith("..."));
  });

  it("returns null when no leading comment", () => {
    const result = parseFile('export const x = 1;', "test.ts");
    assert.equal(result.leadingComment, null);
  });
});

// ── generateSummary ─────────────────────────────────────────────────────────

describe("generateSummary", () => {
  it("uses JSDoc when available", () => {
    const summary = generateSummary("src/tools/foo.ts", [], "My tool description");
    assert.equal(summary, "My tool description");
  });

  it("generates export-based summary", () => {
    const exports = [
      { name: "readFile", kind: "function" as const, isDefault: false },
      { name: "writeFile", kind: "function" as const, isDefault: false },
    ];
    const summary = generateSummary("src/tools/foo.ts", exports, null);
    assert.ok(summary.includes("readFile"));
    assert.ok(summary.includes("writeFile"));
    assert.ok(summary.startsWith("Tools:"));
  });

  it("truncates exports beyond 4", () => {
    const exports = Array.from({ length: 6 }, (_, i) => ({
      name: `fn${i}`, kind: "function" as const, isDefault: false,
    }));
    const summary = generateSummary("src/tools/foo.ts", exports, null);
    assert.ok(summary.includes("+2 more"));
  });

  it("handles test files", () => {
    const summary = generateSummary("src/tools/foo.test.ts", [], null);
    assert.equal(summary, "Tests for foo.ts");
  });

  it("falls back to category module", () => {
    const summary = generateSummary("src/tools/foo.ts", [], null);
    assert.equal(summary, "Tools module");
  });
});

// ── deriveCategory ──────────────────────────────────────────────────────────

describe("deriveCategory", () => {
  it("derives from first dir under src/", () => {
    assert.equal(deriveCategory("src/tools/foo.ts"), "Tools");
    assert.equal(deriveCategory("src/approval/gate.ts"), "Approval");
    assert.equal(deriveCategory("src/messaging/telegram.ts"), "Messaging");
    assert.equal(deriveCategory("src/db/client.ts"), "Database");
    assert.equal(deriveCategory("src/i18n/index.ts"), "i18n");
  });

  it("returns Core for root src/ files", () => {
    assert.equal(deriveCategory("src/index.ts"), "Core");
  });

  it("capitalizes unknown directories", () => {
    assert.equal(deriveCategory("src/newmodule/foo.ts"), "Newmodule");
  });
});

// ── runIndexer (integration) ────────────────────────────────────────────────

describe("runIndexer", () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "indexer-test-"));
    await mkdir(join(tmpDir, "src", "tools"), { recursive: true });
    await writeFile(
      join(tmpDir, "src", "tools", "example.ts"),
      'export function hello() { return "hi"; }\nexport const VERSION = 1;\n',
    );
    await writeFile(
      join(tmpDir, "src", "index.ts"),
      '/** Entry point */\nimport { hello } from "./tools/example.js";\nhello();\n',
    );
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("indexes all .ts files", async () => {
    const { map, stats } = await runIndexer(tmpDir);
    assert.equal(stats.totalFiles, 2);
    assert.equal(stats.parsedFiles, 2);
    assert.equal(stats.cachedFiles, 0);
    assert.ok(map.files["src/tools/example.ts"]);
    assert.ok(map.files["src/index.ts"]);
  });

  it("caches unchanged files on re-run", async () => {
    const { stats } = await runIndexer(tmpDir);
    assert.equal(stats.parsedFiles, 0);
    assert.equal(stats.cachedFiles, 2);
  });

  it("re-parses when file changes", async () => {
    const filePath = join(tmpDir, "src", "tools", "example.ts");
    // Touch the file with a future mtime
    const future = new Date(Date.now() + 5000);
    await utimes(filePath, future, future);

    const { stats } = await runIndexer(tmpDir);
    assert.equal(stats.parsedFiles, 1);
    assert.equal(stats.cachedFiles, 1);
  });

  it("detects removed files", async () => {
    // Add a file, index, remove it, re-index
    const newFile = join(tmpDir, "src", "temp.ts");
    await writeFile(newFile, "export const tmp = 1;\n");
    await runIndexer(tmpDir);

    await rm(newFile);
    const { stats } = await runIndexer(tmpDir);
    assert.equal(stats.removedFiles, 1);
  });

  it("produces correct exports", async () => {
    const { map } = await runIndexer(tmpDir);
    const entry = map.files["src/tools/example.ts"];
    assert.ok(entry);
    const names = entry.exports.map((e) => e.name);
    assert.ok(names.includes("hello"));
    assert.ok(names.includes("VERSION"));
  });

  it("produces correct imports", async () => {
    const { map } = await runIndexer(tmpDir);
    const entry = map.files["src/index.ts"];
    assert.ok(entry);
    assert.ok(entry.imports.some((i) => i.source === "./tools/example.js"));
  });
});

// ── loadProjectMap ──────────────────────────────────────────────────────────

describe("loadProjectMap", () => {
  it("returns null for missing file", async () => {
    const result = await loadProjectMap("/nonexistent/path");
    assert.equal(result, null);
  });

  it("loads existing map", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "indexer-load-"));
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, "src", "a.ts"), "export const x = 1;\n");
    await runIndexer(tmpDir);

    const map = await loadProjectMap(tmpDir);
    assert.ok(map);
    assert.equal(map!.version, 1);
    assert.ok(map!.files["src/a.ts"]);

    await rm(tmpDir, { recursive: true, force: true });
  });
});
