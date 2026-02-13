import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull(),
  toolCallId: text("tool_call_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const cronJobs = sqliteTable("cron_jobs", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["at", "every", "cron"] }).notNull(),
  chatId: text("chat_id").notNull(),
  task: text("task").notNull(),
  schedule: text("schedule").notNull(),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }).notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(5),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// TODO: Not yet wired — approvals are in-memory only (approval-gate.ts uses Map<nonce, resolver>).
// To wire: In approval-gate.ts, INSERT on requestApproval(), UPDATE on resolveApproval().
// On startup, load pending rows and re-create Promise resolvers for each.
// Prerequisite: approval-gate.ts needs access to the Drizzle db instance (currently it doesn't import db).
export const pendingApprovals = sqliteTable("pending_approvals", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  toolName: text("tool_name").notNull(),
  toolArgs: text("tool_args").notNull(),
  riskLevel: text("risk_level", { enum: ["L0", "L1", "L2", "L3"] }).notNull(),
  status: text("status", { enum: ["pending", "approved", "denied", "timeout"] })
    .notNull()
    .default("pending"),
  messageRef: text("message_ref"),
  nonce: text("nonce").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

export const usageLog = sqliteTable("usage_log", {
  id: text("id").primaryKey(),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: text("cost_usd").notNull(), // stored as string to avoid float precision issues
  chatId: text("chat_id").notNull(),
});

// TODO: Not yet wired — webhook configs are in-memory only (webhooks/router.ts uses Map<path, entry>).
// To wire: In router.ts addRoute(), INSERT to DB. In removeRoute(), DELETE from DB.
// On startup in index.ts, SELECT all enabled webhooks and call addRoute() for each.
// Prerequisite: router.ts needs access to the Drizzle db instance (currently it doesn't import db).
export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  secret: text("secret"),
  template: text("template", { enum: ["github", "stripe", "generic"] }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  chatId: text("chat_id").notNull().default("default"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const memoryChunks = sqliteTable("memory_chunks", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),       // "MEMORY.md" or "2026-02-13.md"
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: text("embedding").notNull(),  // JSON-serialized float array
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// TODO: Not yet wired — Google auth currently uses file-based token cache (google/auth.ts writes JSON).
// To wire: In auth.ts, replace readFileSync/writeFileSync token cache with DB INSERT/SELECT.
// On exchangeCode(), INSERT token set. On refreshToken(), UPDATE. On getValidToken(), SELECT.
// Prerequisite: auth.ts needs access to the Drizzle db instance (currently uses config.tokenCachePath).
// Benefit: tokens survive data dir changes, multi-instance sharing, atomic writes.
export const googleTokens = sqliteTable("google_tokens", {
  id: text("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  scopes: text("scopes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const agentSessions = sqliteTable("agent_sessions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  chatId: text("chat_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const privacyRules = sqliteTable("privacy_rules", {
  id: text("id").primaryKey(),
  category: text("category").notNull(), // "email" | "name" | "path" | "secret" | "custom"
  pattern: text("pattern").notNull(), // regex string or literal
  action: text("action").notNull(), // "anonymize" | "block" | "allow"
  scope: text("scope").notNull().default("global"), // "global" | "session"
  label: text("label"), // optional human-readable label
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

