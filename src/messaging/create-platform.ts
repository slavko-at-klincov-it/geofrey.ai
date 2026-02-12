import type { Config } from "../config/schema.js";
import type { MessagingPlatform, PlatformCallbacks } from "./platform.js";

export async function createPlatform(
  config: Config,
  callbacks: PlatformCallbacks,
): Promise<MessagingPlatform> {
  const platformName = config.platform;

  switch (platformName) {
    case "telegram": {
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
    default:
      throw new Error(`Unknown platform: ${platformName}`);
  }
}
