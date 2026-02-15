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

// Wired: approval-gate.ts INSERTs on createApproval(), UPDATEs on resolveApproval()/rejectAllPending().
// DB layer is fire-and-forget (audit trail + crash recovery visibility). In-memory Map + Promise stays primary.
// Call setApprovalDb(db) after getDb() to enable persistence.
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

// Wired: router.ts syncs register/unregister to DB when db param is provided.
// On startup, loadWebhooksFromDb() restores enabled webhooks into the in-memory Map.
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

// Wired via setGoogleTokenDb() in src/integrations/google/auth.ts.
// DB is preferred when set; file-based cache (config.tokenCachePath) remains as fallback.
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

