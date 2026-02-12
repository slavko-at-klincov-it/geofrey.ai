import type { Bot } from "grammy";
import type { StreamEvent } from "../tools/claude-code.js";

const MIN_EDIT_INTERVAL_MS = 1000; // Telegram rate limit: ~30 edits/sec globally
const TELEGRAM_MAX_LENGTH = 4096;

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
    const text = state.buffer.length > TELEGRAM_MAX_LENGTH
      ? state.buffer.slice(0, TELEGRAM_MAX_LENGTH - 3) + "..."
      : state.buffer;
    await bot.api.editMessageText(state.chatId, state.messageId, text);
  } catch {
    // Telegram edit may fail if content unchanged — ignore
  }
}

/**
 * Create a streamer tailored for Claude Code subprocess output.
 * Routes StreamEvent types to compact Telegram updates.
 */
export function createClaudeCodeStream(bot: Bot, chatId: number): {
  start: () => Promise<StreamState>;
  handleEvent: (event: StreamEvent) => void;
  finish: () => Promise<string>;
} {
  let state: StreamState | null = null;
  let resultBuffer = "";

  return {
    async start() {
      const msg = await bot.api.sendMessage(chatId, "🔧 Claude Code arbeitet...");
      state = {
        chatId,
        messageId: msg.message_id,
        buffer: "",
        lastEditAt: 0,
        timer: null,
      };
      return state;
    },

    handleEvent(event: StreamEvent) {
      if (!state) return;

      switch (event.type) {
        case "assistant":
          if (event.content) {
            state.buffer += event.content;
            scheduleEdit(bot, state);
          }
          break;

        case "tool_use":
          if (event.toolName) {
            const line = `\n> ${event.toolName}...`;
            state.buffer += line;
            scheduleEdit(bot, state);
          }
          break;

        case "result":
          if (event.content) {
            resultBuffer = event.content;
            state.buffer = event.content;
            scheduleEdit(bot, state);
          }
          break;
      }
    },

    async finish() {
      if (!state) return resultBuffer;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      const finalText = (resultBuffer || state.buffer || "(no output)").slice(0, TELEGRAM_MAX_LENGTH);
      try {
        await bot.api.editMessageText(state.chatId, state.messageId, finalText);
      } catch {
        // ignore
      }
      return resultBuffer || state.buffer || "(no output)";
    },
  };
}

function scheduleEdit(bot: Bot, state: StreamState) {
  const now = Date.now();
  const elapsed = now - state.lastEditAt;

  if (elapsed >= MIN_EDIT_INTERVAL_MS) {
    flushEdit(bot, state);
  } else if (!state.timer) {
    state.timer = setTimeout(
      () => flushEdit(bot, state),
      MIN_EDIT_INTERVAL_MS - elapsed,
    );
  }
}
