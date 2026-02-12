import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlite: Database.Database | null = null;

export function getDb(url: string) {
  if (!db) {
    sqlite = new Database(url);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });
    initDb();
  }
  return db;
}

function initDb() {
  if (!db) return;

  db.run(sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      telegram_chat_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      tool_call_id TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS pending_approvals (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      tool_name TEXT NOT NULL,
      tool_args TEXT NOT NULL,
      risk_level TEXT NOT NULL CHECK(risk_level IN ('L0', 'L1', 'L2', 'L3')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied', 'timeout')),
      telegram_message_id INTEGER,
      nonce TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER
    )
  `);
}

export function closeDb() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
  db = null;
}
