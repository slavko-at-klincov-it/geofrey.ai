import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(url: string) {
  if (!db) {
    const sqlite = new Database(url);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });
  }
  return db;
}

export function closeDb() {
  // Drizzle doesn't expose close directly — handled via better-sqlite3 reference
  db = null;
}
