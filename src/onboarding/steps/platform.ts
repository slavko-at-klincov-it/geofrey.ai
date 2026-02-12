import { stepHeader } from "../utils/ui.js";
import { askChoice } from "../utils/prompt.js";

export type Platform = "telegram" | "whatsapp" | "signal";

export async function choosePlatform(): Promise<Platform> {
  stepHeader(1, "Messaging-Plattform");

  return askChoice<Platform>("Welche Plattform möchtest du nutzen?", [
    { name: "Telegram (empfohlen)", value: "telegram" },
    { name: "WhatsApp Business", value: "whatsapp" },
    { name: "Signal", value: "signal" },
  ]);
}
