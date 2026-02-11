import type { Bot } from "grammy";

const MIN_EDIT_INTERVAL_MS = 1000; // Telegram rate limit: ~30 edits/sec globally

export interface StreamState {
  chatId: number;
  messageId: number;
  buffer: string;
  lastEditAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export function createStream(bot: Bot, chatId: number): {
  start: () => Promise<StreamState>;
  append: (chunk: string) => void;
  finish: () => Promise<void>;
} {
  let state: StreamState | null = null;

  return {
    async start() {
      const msg = await bot.api.sendMessage(chatId, "...");
      state = {
        chatId,
        messageId: msg.message_id,
        buffer: "",
        lastEditAt: 0,
        timer: null,
      };
      return state;
    },

    append(chunk: string) {
      if (!state) return;
      state.buffer += chunk;

      const now = Date.now();
      const elapsed = now - state.lastEditAt;

      if (elapsed >= MIN_EDIT_INTERVAL_MS) {
        flushEdit(bot, state);
      } else if (!state.timer) {
        state.timer = setTimeout(
          () => flushEdit(bot, state!),
          MIN_EDIT_INTERVAL_MS - elapsed,
        );
      }
    },

    async finish() {
      if (!state) return;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      if (state.buffer) {
        await bot.api.editMessageText(state.chatId, state.messageId, state.buffer);
      }
    },
  };
}

async function flushEdit(bot: Bot, state: StreamState) {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.lastEditAt = Date.now();
  try {
    await bot.api.editMessageText(state.chatId, state.messageId, state.buffer);
  } catch {
    // Telegram edit may fail if content unchanged — ignore
  }
}
