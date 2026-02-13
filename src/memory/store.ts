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

function resolveDir(agentId?: string): string {
  if (agentId) {
    return join(memoryDir, "agents", agentId);
  }
  return memoryDir;
}

async function ensureDir(agentId?: string): Promise<void> {
  await mkdir(resolveDir(agentId), { recursive: true });
}

function memoryPath(agentId?: string): string {
  return join(resolveDir(agentId), "MEMORY.md");
}

function dailyNotePath(date?: string, agentId?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return join(resolveDir(agentId), `${d}.md`);
}

export async function readMemory(agentId?: string): Promise<string> {
  try {
    return await readFile(memoryPath(agentId), "utf-8");
  } catch {
    return "";
  }
}

export async function writeMemory(content: string, agentId?: string): Promise<void> {
  await ensureDir(agentId);
  await writeFile(memoryPath(agentId), content, "utf-8");
}

export async function appendMemory(text: string, agentId?: string): Promise<void> {
  const existing = await readMemory(agentId);
  const separator = existing.length > 0 ? "\n" : "";
  await writeMemory(existing + separator + text, agentId);
}

export async function readDailyNote(date?: string, agentId?: string): Promise<string> {
  try {
    return await readFile(dailyNotePath(date, agentId), "utf-8");
  } catch {
    return "";
  }
}

export async function writeDailyNote(content: string, date?: string, agentId?: string): Promise<void> {
  await ensureDir(agentId);
  await writeFile(dailyNotePath(date, agentId), content, "utf-8");
}

export async function appendDailyNote(text: string, date?: string, agentId?: string): Promise<void> {
  const existing = await readDailyNote(date, agentId);
  const separator = existing.length > 0 ? "\n" : "";
  await writeDailyNote(existing + separator + text, date, agentId);
}

export async function listMemoryFiles(agentId?: string): Promise<string[]> {
  try {
    const entries = await readdir(resolveDir(agentId));
    return entries.filter((e) => e.endsWith(".md"));
  } catch {
    return [];
  }
}
