import { Bot } from "grammy";
import { stepHeader, success, warn, fail, info, spinner } from "../utils/ui.js";
import { askChoice, askSecret, askText, askYesNo } from "../utils/prompt.js";
import { isValidTelegramToken, validateTelegramToken } from "../utils/validate.js";
import { readTokenFromClipboard } from "../utils/clipboard.js";
import { captureScreenshot, extractTokenFromImage, cleanupScreenshot } from "../utils/ocr.js";

export interface TelegramConfig {
  botToken: string;
  ownerId: number;
  botUsername: string;
}

const TELEGRAM_TOKEN_PATTERN = /\d{8,12}:[A-Za-z0-9_-]{35}/;

async function getToken(): Promise<string | null> {
  const method = await askChoice("Wie möchtest du den Bot-Token eingeben?", [
    { name: "Direkt eintippen/einfügen", value: "direct" },
    { name: "Aus der Zwischenablage lesen", value: "clipboard" },
    { name: "Aus einem Screenshot extrahieren (OCR)", value: "ocr" },
  ]);

  if (method === "direct") {
    const token = await askSecret("Bot-Token:");
    return token.trim();
  }

  if (method === "clipboard") {
    const spin = spinner("Zwischenablage wird gelesen...");
    const token = await readTokenFromClipboard(TELEGRAM_TOKEN_PATTERN);
    if (token) {
      spin.succeed("Token in Zwischenablage gefunden");
      const use = await askYesNo(`Token verwenden? (${token.slice(0, 10)}...)`);
      return use ? token : null;
    }
    spin.fail("Kein Token in der Zwischenablage gefunden");
    return null;
  }

  if (method === "ocr") {
    info("Erstelle einen Screenshot des Bot-Tokens...");
    const path = await captureScreenshot();
    if (!path) {
      fail("Screenshot konnte nicht erstellt werden");
      return null;
    }
    const spin = spinner("Token wird aus Screenshot extrahiert...");
    const token = await extractTokenFromImage(path, "telegram");
    cleanupScreenshot(path);
    if (token) {
      spin.succeed("Token extrahiert");
      const use = await askYesNo(`Token verwenden? (${token.slice(0, 10)}...)`);
      return use ? token : null;
    }
    spin.fail("Kein Token im Screenshot gefunden");
    return null;
  }

  return null;
}

async function autoDetectOwnerId(botToken: string, botUsername: string): Promise<number | null> {
  console.log(`\nIch starte den Bot kurz — sende ihm eine Nachricht in Telegram.`);
  info(`→ Öffne: https://t.me/${botUsername}`);

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

    const spin = spinner(`Warte auf Nachricht an @${botUsername}...`);

    bot.on("message", async (ctx) => {
      clearTimeout(timeout);
      const userId = ctx.from.id;
      const userName = ctx.from.first_name;
      spin.succeed(`Nachricht empfangen von: ${userName}`);

      try {
        await ctx.reply(`Deine ID (${userId}) wurde erkannt! 🎉`);
      } catch {
        // ignore send error
      }

      await bot.stop();
      resolve(userId);
    });

    bot.start().catch(() => {
      clearTimeout(timeout);
      spin.fail("Bot konnte nicht gestartet werden");
      resolve(null);
    });
  });
}

export async function setupTelegram(): Promise<TelegramConfig | null> {
  stepHeader(2, "Telegram einrichten");

  const hasBot = await askChoice("Hast du bereits einen Telegram-Bot?", [
    { name: "Ja, ich habe einen Token", value: "yes" },
    { name: "Nein, ich brauche Anleitung", value: "no" },
  ]);

  if (hasBot === "no") {
    console.log(`
  So erstellst du einen Telegram-Bot:
  1. Öffne Telegram und suche nach @BotFather
  2. Sende /newbot
  3. Wähle einen Namen (z.B. "Geofrey AI")
  4. Wähle einen Username (z.B. "mein_geofrey_bot")
  5. BotFather gibt dir einen Token — kopiere ihn
`);
  }

  // Get token with retry
  let botToken: string | null = null;
  let botUsername = "";

  while (!botToken) {
    const token = await getToken();
    if (!token) {
      const retry = await askYesNo("Erneut versuchen?");
      if (!retry) return null;
      continue;
    }

    if (!isValidTelegramToken(token)) {
      fail("Ungültiges Token-Format (erwartet: 12345678:ABCD...)");
      continue;
    }

    const spin = spinner("Token wird validiert...");
    const botInfo = await validateTelegramToken(token);
    if (botInfo) {
      spin.succeed(`Bot gefunden: @${botInfo.username} (${botInfo.name})`);
      botToken = token;
      botUsername = botInfo.username;
    } else {
      spin.fail("Token ungültig — Telegram hat den Token abgelehnt");
    }
  }

  // Auto-detect owner ID
  let ownerId: number | null = null;

  const detectAuto = await askYesNo("Telegram-User-ID automatisch erkennen?");
  if (detectAuto) {
    ownerId = await autoDetectOwnerId(botToken, botUsername);
  }

  if (ownerId) {
    const confirm = await askYesNo(`Deine Telegram-ID: ${ownerId} — korrekt?`);
    if (!confirm) ownerId = null;
  }

  if (!ownerId) {
    info("Alternativ: Sende /start an @userinfobot um deine ID zu erfahren");
    const idStr = await askText("Telegram-User-ID:");
    ownerId = parseInt(idStr, 10);
    if (isNaN(ownerId) || ownerId <= 0) {
      fail("Ungültige User-ID");
      return null;
    }
  }

  return { botToken, ownerId, botUsername };
}
