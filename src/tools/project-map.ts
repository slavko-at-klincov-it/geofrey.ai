import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";

interface ExportInfo {
  name: string;
  kind: string;
  isDefault: boolean;
}

interface ImportInfo {
  source: string;
  specifiers: string[];
  isTypeOnly: boolean;
}

interface FileEntry {
  summary: string;
  exports: ExportInfo[];
  imports: ImportInfo[];
  mtimeMs: number;
  lines: number;
  isTest: boolean;
  category: string;
}

interface ProjectMap {
  version: number;
  generatedAt: string;
  fileCount: number;
  files: Record<string, FileEntry>;
}

async function loadMap(): Promise<ProjectMap | null> {
  try {
    const raw = await readFile(join(process.cwd(), ".geofrey", "project-map.json"), "utf-8");
    return JSON.parse(raw) as ProjectMap;
  } catch {
    return null;
  }
}

function matchesQuery(path: string, entry: FileEntry, query: string): boolean {
  const q = query.toLowerCase();
  if (path.toLowerCase().includes(q)) return true;
  if (entry.summary.toLowerCase().includes(q)) return true;
  if (entry.exports.some((e) => e.name.toLowerCase().includes(q))) return true;
  return false;
}

function formatEntry(path: string, entry: FileEntry): string {
  const exports = entry.exports.length > 0
    ? `  exports: ${entry.exports.map((e) => e.name).join(", ")}`
    : "";
  const imports = entry.imports.filter((i) => !i.isTypeOnly).length > 0
    ? `  imports: ${entry.imports.filter((i) => !i.isTypeOnly).map((i) => i.source).join(", ")}`
    : "";
  const lines = [
    `${path} (${entry.lines}L) — ${entry.summary}`,
    exports,
    imports,
  ].filter(Boolean);
  return lines.join("\n");
}

registerTool({
  name: "project_map",
  description: "Look up project files by name, export, or category. Returns file summaries, exports, and imports.",
  parameters: z.object({
    query: z.string().optional().describe("Filter by file path, export name, or keyword in summary"),
    category: z.string().optional().describe("Filter by category: tools, approval, messaging, orchestrator, security, audit, db, i18n, onboarding, config, indexer"),
  }),
  source: "native",
  execute: async ({ query, category }) => {
    const map = await loadMap();
    if (!map) {
      return "Project map not found. Run `pnpm index` to generate it.";
    }

    let entries = Object.entries(map.files);

    if (category) {
      const cat = category.toLowerCase();
      entries = entries.filter(([, e]) => e.category.toLowerCase() === cat);
    }

    if (query) {
      entries = entries.filter(([path, entry]) => matchesQuery(path, entry, query));
    }

    if (entries.length === 0) {
      return "No matching files found.";
    }

    const header = `${entries.length} files (indexed ${map.generatedAt})\n`;
    const body = entries.map(([path, entry]) => formatEntry(path, entry)).join("\n\n");
    return header + body;
  },
});
