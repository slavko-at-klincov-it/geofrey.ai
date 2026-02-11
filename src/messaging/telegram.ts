import { Bot, Context } from "grammy";
import type { Config } from "../config/schema.js";
import { resolveApproval } from "../approval/approval-gate.js";

let bot: Bot | null = null;

export function createBot(config: Config): Bot {
  bot = new Bot(config.telegram.botToken);

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
    // TODO: Route to agent loop
    // 1. Add message to conversation
    // 2. Run agent loop
    // 3. Send response back
    await ctx.reply("Agent loop noch nicht implementiert.");
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
