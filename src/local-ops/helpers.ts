import { resolve } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { t } from "../i18n/index.js";

const PROJECT_ROOT = process.cwd();

/**
 * Resolve a path and verify it stays within the project root.
 * Throws if the resolved path escapes the project directory.
 */
export function confine(path: string): string {
  const resolved = resolve(path);
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(PROJECT_ROOT + "/")) {
    throw new Error(t("tools.pathOutsideProject", { path }));
  }
  return resolved;
}

/** Human-readable file size (e.g. "1.5 MB"). */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

/** ISO date string without milliseconds (e.g. "2026-02-14T12:30:00Z"). */
export function formatDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface WalkEntry {
  path: string;
  isDirectory: boolean;
  size: number;
}

/**
 * Recursively walk a directory tree.
 * Yields relative paths from the root directory.
 */
export async function* walkDir(
  dir: string,
  opts: { maxDepth?: number; currentDepth?: number } = {},
): AsyncGenerator<WalkEntry> {
  const maxDepth = opts.maxDepth ?? Infinity;
  const currentDepth = opts.currentDepth ?? 0;

  if (currentDepth > maxDepth) return;

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield { path: fullPath, isDirectory: true, size: 0 };
      yield* walkDir(fullPath, { maxDepth, currentDepth: currentDepth + 1 });
    } else {
      const st = await stat(fullPath);
      yield { path: fullPath, isDirectory: false, size: st.size };
    }
  }
}
