import type { Config } from "../config/schema.js";
import type { MessagingPlatform, PlatformCallbacks } from "./platform.js";

export async function createPlatform(
  config: Config,
  callbacks: PlatformCallbacks,
): Promise<MessagingPlatform> {
  const platformName = config.platform;

  switch (platformName) {
    case "telegram": {
      if (!config.telegram) throw new Error("Telegram config missing");
      const { createTelegramPlatform } = await import("./adapters/telegram.js");
      return createTelegramPlatform(config.telegram, callbacks);
    }
    case "whatsapp": {
      if (!config.whatsapp) throw new Error("WhatsApp config missing");
      const { createWhatsAppPlatform } = await import("./adapters/whatsapp.js");
      return createWhatsAppPlatform(config.whatsapp, callbacks);
    }
    case "signal": {
      if (!config.signal) throw new Error("Signal config missing");
      const { createSignalPlatform } = await import("./adapters/signal.js");
      return createSignalPlatform(config.signal, callbacks);
    }
    case "webchat": {
      const { createWebChatPlatform } = await import("./adapters/webchat.js");
      return createWebChatPlatform(config.dashboard, callbacks);
    }
    case "slack": {
      if (!config.slack) throw new Error("Slack config missing");
      const { createSlackPlatform } = await import("./adapters/slack.js");
      return createSlackPlatform(config.slack, callbacks);
    }
    case "discord": {
      if (!config.discord) throw new Error("Discord config missing");
      const { createDiscordPlatform } = await import("./adapters/discord.js");
      return createDiscordPlatform(config.discord, callbacks);
    }
    default:
      throw new Error(`Unknown platform: ${platformName}`);
  }
}
