import { createHash } from "node:crypto";
import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface AuditEntry {
  timestamp: string;
  action: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskLevel: string;
  approved: boolean;
  result: string;
  userId: string;
  claudeSessionId?: string;
  claudeModel?: string;
  costUsd?: number;
  tokensUsed?: number;
  allowedTools?: string;
}

interface StoredEntry extends AuditEntry {
  prevHash: string;
  hash: string;
}

let lastHash = "GENESIS";

export async function initLastHash(logDir: string): Promise<void> {
  try {
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(logDir)
      .filter((f: string) => f.endsWith(".jsonl"))
      .sort();
    if (files.length === 0) return;

    const lastFile = join(logDir, files[files.length - 1]);
    const content = await readFile(lastFile, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return;

    const lastEntry = JSON.parse(lines[lines.length - 1]) as { hash: string };
    if (lastEntry.hash) {
      lastHash = lastEntry.hash;
    }
  } catch {
    // No existing audit log — start fresh with GENESIS
  }
}

export async function appendAuditEntry(
  logDir: string,
  entry: AuditEntry,
): Promise<void> {
  await mkdir(logDir, { recursive: true });

  const stored: StoredEntry = {
    ...entry,
    prevHash: lastHash,
    hash: "",
  };

  // Compute hash over entry + previous hash
  const payload = JSON.stringify({ ...stored, hash: undefined });
  stored.hash = createHash("sha256").update(payload).digest("hex");
  lastHash = stored.hash;

  const logFile = join(logDir, `${entry.timestamp.slice(0, 10)}.jsonl`);
  await appendFile(logFile, JSON.stringify(stored) + "\n");
}

export async function verifyChain(logDir: string, date: string): Promise<{
  valid: boolean;
  entries: number;
  firstBroken?: number;
}> {
  const logFile = join(logDir, `${date}.jsonl`);
  const content = await readFile(logFile, "utf-8");
  const lines = content.trim().split("\n");

  let prevHash = "GENESIS";
  for (let i = 0; i < lines.length; i++) {
    const entry: StoredEntry = JSON.parse(lines[i]);

    if (entry.prevHash !== prevHash) {
      return { valid: false, entries: lines.length, firstBroken: i };
    }

    const payload = JSON.stringify({ ...entry, hash: undefined });
    const computed = createHash("sha256").update(payload).digest("hex");

    if (entry.hash !== computed) {
      return { valid: false, entries: lines.length, firstBroken: i };
    }

    prevHash = entry.hash;
  }

  return { valid: true, entries: lines.length };
}
