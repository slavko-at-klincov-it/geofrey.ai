import { Bot } from "grammy";
import { stepHeader, success, warn, fail, info, spinner } from "../utils/ui.js";
import { askChoice, askSecret, askText, askYesNo } from "../utils/prompt.js";
import { isValidTelegramToken, validateTelegramToken } from "../utils/validate.js";
import { readTokenFromClipboard } from "../utils/clipboard.js";
import { captureScreenshot, extractTokenFromImage, cleanupScreenshot } from "../utils/ocr.js";
import { t } from "../../i18n/index.js";

export interface TelegramConfig {
  botToken: string;
  ownerId: number;
  botUsername: string;
}

const TELEGRAM_TOKEN_PATTERN = /\d{8,12}:[A-Za-z0-9_-]{35}/;

async function getToken(): Promise<string | null> {
  const method = await askChoice(t("onboarding.tokenInputMethod"), [
    { name: t("onboarding.tokenDirect"), value: "direct" },
    { name: t("onboarding.tokenClipboard"), value: "clipboard" },
    { name: t("onboarding.tokenOcr"), value: "ocr" },
  ]);

  if (method === "direct") {
    const token = await askSecret(t("onboarding.tokenPrompt"));
    return token.trim();
  }

  if (method === "clipboard") {
    const spin = spinner(t("onboarding.clipboardReading"));
    const token = await readTokenFromClipboard(TELEGRAM_TOKEN_PATTERN);
    if (token) {
      spin.succeed(t("onboarding.clipboardFound"));
      const use = await askYesNo(t("onboarding.tokenUseConfirm", { preview: token.slice(0, 10) }));
      return use ? token : null;
    }
    spin.fail(t("onboarding.clipboardNotFound"));
    return null;
  }

  if (method === "ocr") {
    info(t("onboarding.ocrHint"));
    const path = await captureScreenshot();
    if (!path) {
      fail(t("onboarding.screenshotFailed"));
      return null;
    }
    const spin = spinner(t("onboarding.ocrExtracting"));
    const token = await extractTokenFromImage(path, "telegram");
    cleanupScreenshot(path);
    if (token) {
      spin.succeed(t("onboarding.ocrExtracted"));
      const use = await askYesNo(t("onboarding.tokenUseConfirm", { preview: token.slice(0, 10) }));
      return use ? token : null;
    }
    spin.fail(t("onboarding.ocrNotFound"));
    return null;
  }

  return null;
}

async function autoDetectOwnerId(botToken: string, botUsername: string): Promise<number | null> {
  console.log(`\n${t("onboarding.autoDetectSend")}`);
  info(t("onboarding.autoDetectOpen", { username: botUsername }));

  const bot = new Bot(botToken);

  // Clear pending updates
  try {
    const updates = await bot.api.getUpdates({ offset: -1, limit: 1 });
    if (updates.length > 0) {
      await bot.api.getUpdates({ offset: updates[updates.length - 1].update_id + 1, limit: 1 });
    }
  } catch {
    // ignore
  }

  return new Promise<number | null>((resolve) => {
    const timeout = setTimeout(async () => {
      await bot.stop();
      resolve(null);
    }, 120_000);

    const spin = spinner(t("onboarding.autoDetectWaiting", { username: botUsername }));

    bot.on("message", async (ctx) => {
      clearTimeout(timeout);
      const userId = ctx.from.id;
      const userName = ctx.from.first_name;
      spin.succeed(t("onboarding.autoDetectReceived", { name: userName }));

      try {
        await ctx.reply(t("onboarding.autoDetectReply", { id: String(userId) }));
      } catch {
        // ignore send error
      }

      await bot.stop();
      resolve(userId);
    });

    bot.start().catch(() => {
      clearTimeout(timeout);
      spin.fail(t("onboarding.autoDetectBotFail"));
      resolve(null);
    });
  });
}

export async function setupTelegram(): Promise<TelegramConfig | null> {
  stepHeader(2, t("onboarding.telegramTitle"));

  const hasBot = await askChoice(t("onboarding.telegramHasBot"), [
    { name: t("onboarding.telegramHasBotYes"), value: "yes" },
    { name: t("onboarding.telegramHasBotNo"), value: "no" },
  ]);

  if (hasBot === "no") {
    console.log(t("onboarding.telegramCreateGuide"));
  }

  // Get token with retry
  let botToken: string | null = null;
  let botUsername = "";

  while (!botToken) {
    const token = await getToken();
    if (!token) {
      const retry = await askYesNo(t("onboarding.retryPrompt"));
      if (!retry) return null;
      continue;
    }

    if (!isValidTelegramToken(token)) {
      fail(t("onboarding.tokenInvalid"));
      continue;
    }

    const spin = spinner(t("onboarding.tokenValidating"));
    const botInfo = await validateTelegramToken(token);
    if (botInfo) {
      spin.succeed(t("onboarding.tokenBotFound", { username: botInfo.username, name: botInfo.name }));
      botToken = token;
      botUsername = botInfo.username;
    } else {
      spin.fail(t("onboarding.tokenRejected"));
    }
  }

  // Auto-detect owner ID
  let ownerId: number | null = null;

  const detectAuto = await askYesNo(t("onboarding.autoDetectId"));
  if (detectAuto) {
    ownerId = await autoDetectOwnerId(botToken, botUsername);
  }

  if (ownerId) {
    const confirm = await askYesNo(t("onboarding.idConfirm", { id: String(ownerId) }));
    if (!confirm) ownerId = null;
  }

  if (!ownerId) {
    info(t("onboarding.idManualHint"));
    const idStr = await askText(t("onboarding.idManualPrompt"));
    ownerId = parseInt(idStr, 10);
    if (isNaN(ownerId) || ownerId <= 0) {
      fail(t("onboarding.idInvalid"));
      return null;
    }
  }

  return { botToken, ownerId, botUsername };
}
