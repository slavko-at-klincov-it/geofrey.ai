import { Bot, Context } from "grammy";
import type { Config } from "../config/schema.js";
import { resolveApproval } from "../approval/approval-gate.js";
import { runAgentLoopStreaming } from "../orchestrator/agent-loop.js";

let bot: Bot | null = null;

export function createBot(config: Config): Bot {
  const b = new Bot(config.telegram.botToken);
  bot = b;

  // Owner-only middleware
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.telegram.ownerId) {
      return; // Silently ignore non-owner messages
    }
    await next();
  });

  // Handle approval callbacks
  bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
    const nonce = ctx.match![1];
    const resolved = resolveApproval(nonce, true);
    if (resolved) {
      await ctx.answerCallbackQuery({ text: "Genehmigt" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } else {
      await ctx.answerCallbackQuery({ text: "Abgelaufen" });
    }
  });

  bot.callbackQuery(/^deny:(.+)$/, async (ctx) => {
    const nonce = ctx.match![1];
    const resolved = resolveApproval(nonce, false);
    if (resolved) {
      await ctx.answerCallbackQuery({ text: "Abgelehnt" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } else {
      await ctx.answerCallbackQuery({ text: "Abgelaufen" });
    }
  });

  // Handle text messages → orchestrator
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    try {
      await runAgentLoopStreaming(config, chatId, text, b);
    } catch (err) {
      console.error("Agent loop error:", err);
      await ctx.reply("Fehler bei der Verarbeitung. Bitte versuche es erneut.");
    }
  });

  return bot;
}

export function getBot(): Bot | null {
  return bot;
}

export async function startPolling(b: Bot): Promise<void> {
  await b.start({
    onStart: () => console.log("Telegram bot started (long polling)"),
  });
}

export async function stopPolling(b: Bot): Promise<void> {
  await b.stop();
}
