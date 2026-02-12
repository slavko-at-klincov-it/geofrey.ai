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
