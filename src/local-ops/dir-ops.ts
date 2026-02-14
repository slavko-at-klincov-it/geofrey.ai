import { readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { confine, formatSize } from "./helpers.js";

/** Generate a tree representation of a directory. */
export async function treeOp(
  path: string,
  opts?: { maxDepth?: number; maxEntries?: number },
): Promise<string> {
  const dir = confine(path);
  const maxDepth = opts?.maxDepth ?? 4;
  const maxEntries = opts?.maxEntries ?? 200;
  const lines: string[] = [];
  let count = 0;

  await buildTree(dir, "", maxDepth, 0, lines, { count: 0, max: maxEntries });

  return lines.join("\n");
}

interface Counter { count: number; max: number }

async function buildTree(
  dir: string,
  prefix: string,
  maxDepth: number,
  depth: number,
  lines: string[],
  counter: Counter,
): Promise<void> {
  if (depth > maxDepth || counter.count >= counter.max) return;

  const entries = await readdir(dir, { withFileTypes: true });
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < sorted.length; i++) {
    if (counter.count >= counter.max) {
      lines.push(`${prefix}... (truncated)`);
      return;
    }

    const entry = sorted[i];
    const isLast = i === sorted.length - 1;
    const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
    const childPrefix = isLast ? "    " : "\u2502   ";
    const icon = entry.isDirectory() ? "\uD83D\uDCC1" : "";

    lines.push(`${prefix}${connector}${icon}${entry.name}`);
    counter.count++;

    if (entry.isDirectory()) {
      const childPath = resolve(dir, entry.name);
      await buildTree(childPath, prefix + childPrefix, maxDepth, depth + 1, lines, counter);
    }
  }
}

/** Calculate the total size of a directory recursively. */
export async function dirSizeOp(path: string): Promise<string> {
  const dir = confine(path);
  let totalSize = 0;
  let fileCount = 0;
  let dirCount = 0;

  await sumDir(dir);

  return [
    `Directory: ${path}`,
    `Total size: ${formatSize(totalSize)}`,
    `Files: ${fileCount}`,
    `Directories: ${dirCount}`,
  ].join("\n");

  async function sumDir(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        dirCount++;
        await sumDir(fullPath);
      } else {
        const st = await stat(fullPath);
        totalSize += st.size;
        fileCount++;
      }
    }
  }
}
