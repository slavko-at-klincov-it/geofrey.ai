import { Bot, InlineKeyboard } from "grammy";
import type { Classification } from "../../approval/risk-classifier.js";
import type { MessagingPlatform, PlatformCallbacks, ChatId, MessageRef } from "../platform.js";
import { t } from "../../i18n/index.js";

interface TelegramConfig {
  botToken: string;
  ownerId: number;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

function formatApprovalMessage(
  nonce: string,
  toolName: string,
  args: Record<string, unknown>,
  classification: Classification,
): { text: string; keyboard: InlineKeyboard } {
  const text = [
    `*${escapeMarkdown(t("messaging.approvalRequired"))}* \\[#${nonce}\\]`,
    ``,
    `*${escapeMarkdown(t("messaging.actionLabel"))}* \`${toolName}\``,
    `*${escapeMarkdown(t("messaging.riskLabel"))}* ${classification.level} — ${escapeMarkdown(classification.reason)}`,
    `*${escapeMarkdown(t("messaging.detailsLabel"))}* \`${escapeMarkdown(JSON.stringify(args).slice(0, 200))}\``,
  ].join("\n");

  const keyboard = new InlineKeyboard()
    .text(t("messaging.approve"), `approve:${nonce}`)
    .text(t("messaging.deny"), `deny:${nonce}`);

  return { text, keyboard };
}

export function createTelegramPlatform(
  config: TelegramConfig,
  callbacks: PlatformCallbacks,
): MessagingPlatform {
  const bot = new Bot(config.botToken);

  // Owner-only middleware
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.ownerId) return;
    await next();
  });

  // Handle approval callbacks
  bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
    const nonce = ctx.match![1];
    await callbacks.onApprovalResponse(nonce, true);
    await ctx.answerCallbackQuery({ text: t("messaging.approved") });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
  });

  bot.callbackQuery(/^deny:(.+)$/, async (ctx) => {
    const nonce = ctx.match![1];
    await callbacks.onApprovalResponse(nonce, false);
    await ctx.answerCallbackQuery({ text: t("messaging.denied") });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
  });

  // Handle text messages
  bot.on("message:text", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text;
    try {
      await callbacks.onMessage(chatId, text);
    } catch (err) {
      console.error("Agent loop error:", err);
      await ctx.reply(t("messaging.processingError"));
    }
  });

  return {
    name: "telegram",
    maxMessageLength: 4096,
    supportsEdit: true,

    async sendMessage(chatId: ChatId, text: string): Promise<MessageRef> {
      const msg = await bot.api.sendMessage(Number(chatId), text);
      return String(msg.message_id);
    },

    async editMessage(chatId: ChatId, ref: MessageRef, text: string): Promise<MessageRef> {
      await bot.api.editMessageText(Number(chatId), Number(ref), text);
      return ref;
    },

    async sendApproval(
      chatId: ChatId,
      nonce: string,
      toolName: string,
      args: Record<string, unknown>,
      classification: Classification,
    ): Promise<void> {
      const { text, keyboard } = formatApprovalMessage(nonce, toolName, args, classification);
      await bot.api.sendMessage(Number(chatId), text, {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
    },

    async start(): Promise<void> {
      await bot.start({
        onStart: () => console.log("Telegram bot started (long polling)"),
      });
    },

    async stop(): Promise<void> {
      await bot.stop();
    },
  };
}

// Re-export for backward compatibility in approval-ui tests
export { formatApprovalMessage, escapeMarkdown };
