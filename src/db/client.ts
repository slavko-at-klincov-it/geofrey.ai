import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
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
    migrate(db, { migrationsFolder: "./drizzle" });

    // Record initial schema version (backwards compat)
    db.run(sql`INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, ${Date.now()})`);
    db.run(sql`INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (2, ${Date.now()})`);
    db.run(sql`INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (3, ${Date.now()})`);
    db.run(sql`INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (4, ${Date.now()})`);
    db.run(sql`INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (5, ${Date.now()})`);
    db.run(sql`INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (6, ${Date.now()})`);
    db.run(sql`INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (7, ${Date.now()})`);
  }
  return db;
}

export function closeDb() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
  db = null;
}
