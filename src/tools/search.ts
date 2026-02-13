import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";

const MAX_RESULTS = 20;
const MAX_CONTEXT_LINES = 2;

function confine(path: string): string {
  const resolved = resolve(path);
  const cwd = process.cwd();
  if (!resolved.startsWith(cwd)) {
    throw new Error(`Path outside project directory: ${path}`);
  }
  return resolved;
}

async function walkDir(dir: string, results: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git" || entry.name === ".geofrey") continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, results);
    } else if (/\.(ts|js|json|md|txt|yaml|yml|toml|env|sh)$/i.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      results.push(fullPath);
    }
  }
}

registerTool({
  name: "search",
  description: "Search file contents for a pattern (grep-style). Returns matching lines with file path and line number.",
  parameters: z.object({
    pattern: z.string().describe("Text or regex pattern to search for"),
    path: z.string().optional().describe("Directory or file to search in (default: project root)"),
  }),
  source: "native",
  execute: async ({ pattern, path }) => {
    const searchRoot = confine(path ?? ".");
    const files: string[] = [];
    await walkDir(searchRoot, files);

    const regex = new RegExp(pattern, "i");
    const results: string[] = [];
    const cwd = process.cwd();

    for (const file of files) {
      if (results.length >= MAX_RESULTS) break;
      try {
        const content = await readFile(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= MAX_RESULTS) break;
          if (regex.test(lines[i])) {
            const relPath = relative(cwd, file);
            const lineNum = i + 1;
            const context: string[] = [];
            for (let c = Math.max(0, i - MAX_CONTEXT_LINES); c <= Math.min(lines.length - 1, i + MAX_CONTEXT_LINES); c++) {
              const prefix = c === i ? ">" : " ";
              context.push(`${prefix} ${c + 1}: ${lines[c]}`);
            }
            results.push(`${relPath}:${lineNum}\n${context.join("\n")}`);
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    if (results.length === 0) {
      return `No matches for "${pattern}"`;
    }
    return `${results.length} match${results.length > 1 ? "es" : ""} (max ${MAX_RESULTS}):\n\n${results.join("\n\n")}`;
  },
});
