export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  telegramChatId: number;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

// In-memory conversation state (persisted to SQLite on write)
const active = new Map<number, Conversation>();

export function getOrCreate(chatId: number): Conversation {
  let conv = active.get(chatId);
  if (!conv) {
    conv = {
      id: crypto.randomUUID(),
      telegramChatId: chatId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    active.set(chatId, conv);
  }
  return conv;
}

export function addMessage(chatId: number, message: Omit<Message, "id" | "createdAt">): Message {
  const conv = getOrCreate(chatId);
  const msg: Message = {
    ...message,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };
  conv.messages.push(msg);
  conv.updatedAt = new Date();
  return msg;
}

export function getHistory(chatId: number): Message[] {
  return getOrCreate(chatId).messages;
}

export function clearConversation(chatId: number): void {
  active.delete(chatId);
}
