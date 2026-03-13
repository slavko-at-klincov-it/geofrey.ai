import { eq, and, lt } from "drizzle-orm";
import { proactiveReminders } from "../db/schema.js";
import { randomBytes } from "node:crypto";

type DedupDb = ReturnType<typeof import("../db/client.js")["getDb"]>;

let db: DedupDb | null = null;

// Fallback in-memory map (used when DB not initialized, e.g. in tests)
const inMemory = new Map<string, number>();

export function setDedupDb(database: DedupDb): void {
  db = database;
}

export function wasAlreadyReminded(type: string, externalId: string): boolean {
  if (!db) return inMemory.has(`${type}:${externalId}`);

  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  const rows = db
    .select()
    .from(proactiveReminders)
    .where(
      and(
        eq(proactiveReminders.type, type),
        eq(proactiveReminders.externalId, externalId),
      ),
    )
    .all()
    .filter((r) => r.remindedAt.getTime() > cutoff.getTime());
  return rows.length > 0;
}

export function markReminded(type: string, externalId: string): void {
  if (!db) {
    inMemory.set(`${type}:${externalId}`, Date.now());
    return;
  }

  try {
    db.insert(proactiveReminders)
      .values({
        id: randomBytes(8).toString("hex"),
        type,
        externalId,
        remindedAt: new Date(),
      })
      .run();
  } catch {
    // fire-and-forget
  }
}

export function cleanupReminders(): void {
  if (!db) {
    const cutoff = Date.now() - 24 * 60 * 60_000;
    for (const [key, ts] of inMemory) {
      if (ts < cutoff) inMemory.delete(key);
    }
    return;
  }

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
    db.delete(proactiveReminders)
      .where(lt(proactiveReminders.remindedAt, cutoff))
      .run();
  } catch {
    // fire-and-forget
  }
}

/** Visible for testing */
export function _resetReminders(): void {
  inMemory.clear();
  if (db) {
    try {
      db.delete(proactiveReminders).run();
    } catch {
      // fire-and-forget
    }
  }
}
