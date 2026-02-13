import { eq, desc } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { conversations, messages } from "../db/schema.js";
import { estimateMessagesTokens } from "./compaction/token-counter.js";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  chatId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

const active = new Map<string, Conversation>();

let db: ReturnType<typeof getDb> | null = null;

export function setDbUrl(url: string) {
  db = getDb(url);
}

export function getOrCreate(chatId: string): Conversation {
  let conv = active.get(chatId);
  if (!conv) {
    if (db) {
      const existing = db
        .select()
        .from(conversations)
        .where(eq(conversations.chatId, chatId))
        .orderBy(desc(conversations.updatedAt))
        .limit(1)
        .all();

      if (existing.length > 0) {
        const dbConv = existing[0];
        const dbMessages = db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, dbConv.id))
          .orderBy(messages.createdAt)
          .all();

        conv = {
          id: dbConv.id,
          chatId: dbConv.chatId,
          messages: dbMessages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            toolCallId: m.toolCallId ?? undefined,
            createdAt: m.createdAt,
          })),
          createdAt: dbConv.createdAt,
          updatedAt: dbConv.updatedAt,
        };
        active.set(chatId, conv);
        return conv;
      }
    }

    conv = {
      id: crypto.randomUUID(),
      chatId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    active.set(chatId, conv);

    if (db) {
      db.insert(conversations).values({
        id: conv.id,
        chatId: conv.chatId,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      }).run();
    }
  }
  return conv;
}

export function addMessage(chatId: string, message: Omit<Message, "id" | "createdAt">): Message {
  const conv = getOrCreate(chatId);
  const msg: Message = {
    ...message,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };
  conv.messages.push(msg);
  conv.updatedAt = new Date();

  if (db) {
    db.insert(messages).values({
      id: msg.id,
      conversationId: conv.id,
      role: msg.role,
      content: msg.content,
      toolCallId: msg.toolCallId ?? null,
      createdAt: msg.createdAt,
    }).run();

    db.update(conversations)
      .set({ updatedAt: conv.updatedAt })
      .where(eq(conversations.id, conv.id))
      .run();
  }

  return msg;
}

export function getHistory(chatId: string): Message[] {
  return getOrCreate(chatId).messages;
}

export function compactMessages(chatId: string, summary: string): void {
  const conv = getOrCreate(chatId);
  const summaryMsg: Message = {
    id: crypto.randomUUID(),
    role: "system",
    content: `[Previous conversation summary]\n${summary}`,
    createdAt: new Date(),
  };
  const recentMessages = conv.messages.slice(-10);
  conv.messages = [summaryMsg, ...recentMessages];
  conv.updatedAt = new Date();

  if (db) {
    // Use a transaction for atomicity: delete old messages, insert summary
    db.transaction(() => {
      db!.delete(messages)
        .where(eq(messages.conversationId, conv.id))
        .run();

      // Insert summary message
      db!.insert(messages).values({
        id: summaryMsg.id,
        conversationId: conv.id,
        role: summaryMsg.role,
        content: summaryMsg.content,
        toolCallId: null,
        createdAt: summaryMsg.createdAt,
      }).run();

      // Re-insert recent messages
      for (const msg of recentMessages) {
        db!.insert(messages).values({
          id: msg.id,
          conversationId: conv.id,
          role: msg.role,
          content: msg.content,
          toolCallId: msg.toolCallId ?? null,
          createdAt: msg.createdAt,
        }).run();
      }

      db!.update(conversations)
        .set({ updatedAt: conv.updatedAt })
        .where(eq(conversations.id, conv.id))
        .run();
    });
  }
}

export function getTokenCount(chatId: string): number {
  const history = getHistory(chatId);
  return estimateMessagesTokens(history.map((m) => ({ role: m.role, content: m.content })));
}
