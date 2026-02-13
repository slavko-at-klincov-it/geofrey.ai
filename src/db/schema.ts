import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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

// TODO: Not yet wired into approval-gate.ts — approvals are currently in-memory only.
// This table is reserved for future persistence of approval state across restarts.
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

export const memoryChunks = sqliteTable("memory_chunks", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),       // "MEMORY.md" or "2026-02-13.md"
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: text("embedding").notNull(),  // JSON-serialized float array
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
