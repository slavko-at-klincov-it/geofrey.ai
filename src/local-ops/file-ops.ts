import { mkdir as fsMkdir, copyFile as fsCopyFile, rename, stat, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative, basename } from "node:path";
import { confine, formatSize, formatDate } from "./helpers.js";
import { t } from "../i18n/index.js";

/** Create a directory (recursive). */
export async function mkdirOp(path: string): Promise<string> {
  const resolved = confine(path);
  await fsMkdir(resolved, { recursive: true });
  return t("localOps.mkdirDone", { path });
}

/** Copy a file from source to destination. */
export async function copyFileOp(source: string, destination: string): Promise<string> {
  const src = confine(source);
  const dst = confine(destination);
  await fsCopyFile(src, dst);
  return t("localOps.copyDone", { source, destination });
}

/** Move/rename a file. */
export async function moveFileOp(source: string, destination: string): Promise<string> {
  const src = confine(source);
  const dst = confine(destination);
  await rename(src, dst);
  return t("localOps.moveDone", { source, destination });
}

/** Get file metadata (size, dates, type). */
export async function fileInfoOp(path: string): Promise<string> {
  const resolved = confine(path);
  const st = await stat(resolved);
  const type = st.isDirectory() ? "directory" : st.isFile() ? "file" : "other";
  return [
    `Path: ${path}`,
    `Type: ${type}`,
    `Size: ${formatSize(st.size)}`,
    `Created: ${formatDate(st.birthtime)}`,
    `Modified: ${formatDate(st.mtime)}`,
    `Permissions: ${(st.mode & 0o777).toString(8)}`,
  ].join("\n");
}

/** Find files matching a glob-like pattern (simple wildcard matching). */
export async function findFilesOp(
  directory: string,
  pattern: string,
  opts?: { maxResults?: number },
): Promise<string> {
  const dir = confine(directory);
  const maxResults = opts?.maxResults ?? 50;
  const regex = patternToRegex(pattern);
  const results: string[] = [];

  await findRecursive(dir, dir, regex, results, maxResults);

  if (results.length === 0) return t("tools.noMatchingFiles");
  return results.join("\n");
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__GLOBSTAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__GLOBSTAR__/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

async function findRecursive(
  root: string,
  current: string,
  regex: RegExp,
  results: string[],
  maxResults: number,
): Promise<void> {
  if (results.length >= maxResults) return;

  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= maxResults) return;
    const fullPath = resolve(current, entry.name);
    const relativePath = relative(root, fullPath);

    if (regex.test(relativePath) || regex.test(entry.name)) {
      results.push(relativePath);
    }

    if (entry.isDirectory()) {
      await findRecursive(root, fullPath, regex, results, maxResults);
    }
  }
}

/** Search and replace text in a file using regex. */
export async function searchReplaceOp(
  path: string,
  search: string,
  replace: string,
  opts?: { regex?: boolean },
): Promise<string> {
  const resolved = confine(path);
  const content = await readFile(resolved, "utf-8");
  const pattern = opts?.regex ? new RegExp(search, "g") : new RegExp(escapeRegex(search), "g");
  const matches = content.match(pattern);
  if (!matches || matches.length === 0) {
    return t("localOps.searchReplaceNoMatch", { search });
  }
  const updated = content.replace(pattern, replace);
  await writeFile(resolved, updated, "utf-8");
  return t("localOps.searchReplaceDone", { count: String(matches.length), path });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
