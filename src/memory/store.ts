import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

let memoryDir = resolve("data/memory");

/** Override memory directory (used for testing) */
export function setMemoryDir(dir: string): void {
  memoryDir = dir;
}

export function getMemoryDir(): string {
  return memoryDir;
}

async function ensureDir(): Promise<void> {
  await mkdir(memoryDir, { recursive: true });
}

function memoryPath(): string {
  return join(memoryDir, "MEMORY.md");
}

function dailyNotePath(date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return join(memoryDir, `${d}.md`);
}

export async function readMemory(): Promise<string> {
  try {
    return await readFile(memoryPath(), "utf-8");
  } catch {
    return "";
  }
}

export async function writeMemory(content: string): Promise<void> {
  await ensureDir();
  await writeFile(memoryPath(), content, "utf-8");
}

export async function appendMemory(text: string): Promise<void> {
  const existing = await readMemory();
  const separator = existing.length > 0 ? "\n" : "";
  await writeMemory(existing + separator + text);
}

export async function readDailyNote(date?: string): Promise<string> {
  try {
    return await readFile(dailyNotePath(date), "utf-8");
  } catch {
    return "";
  }
}

export async function writeDailyNote(content: string, date?: string): Promise<void> {
  await ensureDir();
  await writeFile(dailyNotePath(date), content, "utf-8");
}

export async function appendDailyNote(text: string, date?: string): Promise<void> {
  const existing = await readDailyNote(date);
  const separator = existing.length > 0 ? "\n" : "";
  await writeDailyNote(existing + separator + text, date);
}

export async function listMemoryFiles(): Promise<string[]> {
  try {
    const entries = await readdir(memoryDir);
    return entries.filter((e) => e.endsWith(".md"));
  } catch {
    return [];
  }
}
