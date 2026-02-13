import { readFile, readdir, writeFile, stat, mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { parseFile, type ExportInfo, type ImportInfo } from "./parser.js";
import { generateSummary, deriveCategory } from "./summary.js";

export type { ExportInfo, ImportInfo } from "./parser.js";

export interface FileEntry {
  summary: string;
  exports: ExportInfo[];
  imports: ImportInfo[];
  mtimeMs: number;
  lines: number;
  isTest: boolean;
  category: string;
}

export interface ProjectMap {
  version: 1;
  generatedAt: string;
  fileCount: number;
  files: Record<string, FileEntry>;
}

export interface IndexResult {
  map: ProjectMap;
  stats: {
    totalFiles: number;
    parsedFiles: number;
    cachedFiles: number;
    removedFiles: number;
    durationMs: number;
  };
}

const MAP_DIR = ".geofrey";
const MAP_FILE = "project-map.json";

function mapPath(rootDir: string): string {
  return join(rootDir, MAP_DIR, MAP_FILE);
}

export async function loadProjectMap(rootDir: string): Promise<ProjectMap | null> {
  try {
    const raw = await readFile(mapPath(rootDir), "utf-8");
    return JSON.parse(raw) as ProjectMap;
  } catch {
    return null;
  }
}

async function walkDir(dir: string, rootDir: string, results: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      await walkDir(fullPath, rootDir, results);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      results.push(relative(rootDir, fullPath));
    }
  }
}

export async function runIndexer(rootDir: string): Promise<IndexResult> {
  const start = performance.now();

  const existing = await loadProjectMap(rootDir);
  const oldFiles = existing?.files ?? {};

  // Discover all .ts files under src/
  const filePaths: string[] = [];
  await walkDir(join(rootDir, "src"), rootDir, filePaths);
  filePaths.sort();

  const newFiles: Record<string, FileEntry> = {};
  let parsedFiles = 0;
  let cachedFiles = 0;

  for (const relPath of filePaths) {
    const absPath = join(rootDir, relPath);
    const fileStat = await stat(absPath);
    const mtimeMs = Math.floor(fileStat.mtimeMs);

    // Check cache: same mtime → reuse
    const oldEntry = oldFiles[relPath];
    if (oldEntry && oldEntry.mtimeMs === mtimeMs) {
      newFiles[relPath] = oldEntry;
      cachedFiles++;
      continue;
    }

    // Parse the file
    const sourceText = await readFile(absPath, "utf-8");
    const result = parseFile(sourceText, relPath);
    const isTest = /\.test\.ts$/.test(relPath);
    const category = deriveCategory(relPath);
    const summary = generateSummary(relPath, result.exports, result.leadingComment);
    const lines = sourceText.split("\n").length;

    newFiles[relPath] = {
      summary,
      exports: result.exports,
      imports: result.imports,
      mtimeMs,
      lines,
      isTest,
      category,
    };
    parsedFiles++;
  }

  // Count removed files
  const oldKeys = new Set(Object.keys(oldFiles));
  const newKeys = new Set(Object.keys(newFiles));
  let removedFiles = 0;
  for (const key of oldKeys) {
    if (!newKeys.has(key)) removedFiles++;
  }

  const map: ProjectMap = {
    version: 1,
    generatedAt: new Date().toISOString(),
    fileCount: filePaths.length,
    files: newFiles,
  };

  // Write output
  const outDir = join(rootDir, MAP_DIR);
  await mkdir(outDir, { recursive: true });
  await writeFile(mapPath(rootDir), JSON.stringify(map, null, 2) + "\n", "utf-8");

  const durationMs = Math.round(performance.now() - start);

  return {
    map,
    stats: { totalFiles: filePaths.length, parsedFiles, cachedFiles, removedFiles, durationMs },
  };
}
