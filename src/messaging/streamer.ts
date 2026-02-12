import type { MessagingPlatform, ChatId, MessageRef } from "./platform.js";
import type { StreamEvent } from "../tools/claude-code.js";
import { t } from "../i18n/index.js";

const MIN_EDIT_INTERVAL_MS = 1000;

export interface StreamState {
  chatId: ChatId;
  messageRef: MessageRef;
  buffer: string;
  lastEditAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export function createStream(platform: MessagingPlatform, chatId: ChatId): {
  start: () => Promise<StreamState>;
  append: (chunk: string) => void;
  finish: () => Promise<void>;
} {
  let state: StreamState | null = null;

  return {
    async start() {
      const ref = await platform.sendMessage(chatId, "...");
      state = {
        chatId,
        messageRef: ref,
        buffer: "",
        lastEditAt: 0,
        timer: null,
      };
      return state;
    },

    append(chunk: string) {
      if (!state) return;
      state.buffer += chunk;
      scheduleEdit(platform, state);
    },

    async finish() {
      if (!state) return;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      if (state.buffer) {
        if (platform.supportsEdit) {
          await platform.editMessage(state.chatId, state.messageRef, state.buffer);
        } else {
          await platform.sendMessage(state.chatId, state.buffer);
        }
      }
    },
  };
}

async function flushEdit(platform: MessagingPlatform, state: StreamState) {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.lastEditAt = Date.now();
  try {
    const maxLen = platform.maxMessageLength;
    const text = state.buffer.length > maxLen
      ? state.buffer.slice(0, maxLen - 3) + "..."
      : state.buffer;
    if (platform.supportsEdit) {
      await platform.editMessage(state.chatId, state.messageRef, text);
    }
    // Non-edit platforms skip intermediate flushes — final text sent in finish()
  } catch {
    // Edit may fail if content unchanged — ignore
  }
}

function scheduleEdit(platform: MessagingPlatform, state: StreamState) {
  const now = Date.now();
  const elapsed = now - state.lastEditAt;

  if (elapsed >= MIN_EDIT_INTERVAL_MS) {
    flushEdit(platform, state);
  } else if (!state.timer) {
    state.timer = setTimeout(
      () => flushEdit(platform, state),
      MIN_EDIT_INTERVAL_MS - elapsed,
    );
  }
}

/**
 * Create a streamer tailored for Claude Code subprocess output.
 * Routes StreamEvent types to platform updates.
 */
export function createClaudeCodeStream(platform: MessagingPlatform, chatId: ChatId): {
  start: () => Promise<StreamState>;
  handleEvent: (event: StreamEvent) => void;
  finish: () => Promise<string>;
} {
  let state: StreamState | null = null;
  let resultBuffer = "";

  return {
    async start() {
      const ref = await platform.sendMessage(chatId, t("messaging.claudeWorking"));
      state = {
        chatId,
        messageRef: ref,
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
            scheduleEdit(platform, state);
          }
          break;

        case "tool_use":
          if (event.toolName) {
            const line = `\n> ${event.toolName}...`;
            state.buffer += line;
            scheduleEdit(platform, state);
          }
          break;

        case "result":
          if (event.content) {
            resultBuffer = event.content;
            state.buffer = event.content;
            scheduleEdit(platform, state);
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
      const maxLen = platform.maxMessageLength;
      const finalText = (resultBuffer || state.buffer || t("messaging.noOutput")).slice(0, maxLen);
      try {
        if (platform.supportsEdit) {
          await platform.editMessage(state.chatId, state.messageRef, finalText);
        } else {
          await platform.sendMessage(state.chatId, finalText);
        }
      } catch {
        // ignore
      }
      return resultBuffer || state.buffer || t("messaging.noOutput");
    },
  };
}
