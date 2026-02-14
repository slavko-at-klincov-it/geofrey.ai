import { readFile } from "node:fs/promises";
import { confine, formatSize } from "./helpers.js";
import { t } from "../i18n/index.js";

/** Get text statistics for a file (lines, words, chars, size). */
export async function textStatsOp(path: string): Promise<string> {
  const resolved = confine(path);
  const content = await readFile(resolved, "utf-8");
  const lines = content.split("\n").length;
  const words = content.split(/\s+/).filter(Boolean).length;
  const chars = content.length;
  const bytes = Buffer.byteLength(content, "utf-8");

  return [
    `File: ${path}`,
    `Lines: ${lines}`,
    `Words: ${words}`,
    `Characters: ${chars}`,
    `Size: ${formatSize(bytes)}`,
  ].join("\n");
}

/** Read the first N lines of a file. */
export async function headOp(path: string, lines: number = 10): Promise<string> {
  const resolved = confine(path);
  const content = await readFile(resolved, "utf-8");
  return content.split("\n").slice(0, lines).join("\n");
}

/** Read the last N lines of a file. */
export async function tailOp(path: string, lines: number = 10): Promise<string> {
  const resolved = confine(path);
  const content = await readFile(resolved, "utf-8");
  const allLines = content.split("\n");
  return allLines.slice(-lines).join("\n");
}

/** Compare two files and show differences. */
export async function diffFilesOp(pathA: string, pathB: string): Promise<string> {
  const resolvedA = confine(pathA);
  const resolvedB = confine(pathB);
  const contentA = await readFile(resolvedA, "utf-8");
  const contentB = await readFile(resolvedB, "utf-8");

  const linesA = contentA.split("\n");
  const linesB = contentB.split("\n");

  const maxLen = Math.max(linesA.length, linesB.length);
  const diffs: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const a = linesA[i];
    const b = linesB[i];
    if (a !== b) {
      if (a !== undefined && b !== undefined) {
        diffs.push(`Line ${i + 1}:\n  - ${a}\n  + ${b}`);
      } else if (a !== undefined) {
        diffs.push(`Line ${i + 1}:\n  - ${a}`);
      } else {
        diffs.push(`Line ${i + 1}:\n  + ${b}`);
      }
    }
  }

  if (diffs.length === 0) return t("localOps.diffIdentical");
  return `${diffs.length} differences:\n${diffs.join("\n")}`;
}

/** Sort lines of a file and return (does not write). */
export async function sortLinesOp(
  path: string,
  opts?: { reverse?: boolean; numeric?: boolean },
): Promise<string> {
  const resolved = confine(path);
  const content = await readFile(resolved, "utf-8");
  const lines = content.split("\n");

  if (opts?.numeric) {
    lines.sort((a, b) => {
      const na = parseFloat(a) || 0;
      const nb = parseFloat(b) || 0;
      return na - nb;
    });
  } else {
    lines.sort();
  }

  if (opts?.reverse) lines.reverse();
  return lines.join("\n");
}

/** Encode or decode base64. */
export async function base64Op(
  input: string,
  action: "encode" | "decode",
): Promise<string> {
  if (action === "encode") {
    return Buffer.from(input, "utf-8").toString("base64");
  }
  return Buffer.from(input, "base64").toString("utf-8");
}

/** Count lines in a file. */
export async function countLinesOp(path: string): Promise<string> {
  const resolved = confine(path);
  const content = await readFile(resolved, "utf-8");
  const count = content.split("\n").length;
  return t("localOps.countLines", { count: String(count), path });
}
