import { banner } from "./utils/ui.js";
import { runPrerequisites } from "./steps/prerequisites.js";
import { choosePlatform, type Platform } from "./steps/platform.js";
import { setupTelegram, type TelegramConfig } from "./steps/telegram.js";
import { setupWhatsApp, type WhatsAppConfig } from "./steps/whatsapp.js";
import { setupSignal, type SignalConfig } from "./steps/signal.js";
import { setupClaudeAuth, type ClaudeAuthResult } from "./steps/claude-auth.js";
import { showSummary } from "./steps/summary.js";

export interface WizardState {
  platform: Platform;
  telegram?: TelegramConfig;
  whatsapp?: WhatsAppConfig;
  signal?: SignalConfig;
  ollamaUrl: string;
  model: string;
  claude?: ClaudeAuthResult;
}

export async function runWizard(): Promise<WizardState | null> {
  banner();

  // Step 0: Prerequisites
  const prereqs = await runPrerequisites();
  if (!prereqs.nodeOk) {
    console.log("\nNode.js 22+ ist erforderlich. Setup abgebrochen.\n");
    return null;
  }

  // Step 1: Platform
  const platform = await choosePlatform();

  // Step 2: Platform-specific setup
  const state: WizardState = {
    platform,
    ollamaUrl: "http://localhost:11434",
    model: "qwen3:8b",
  };

  if (platform === "telegram") {
    const config = await setupTelegram();
    if (!config) {
      console.log("\nTelegram-Setup abgebrochen.\n");
      return null;
    }
    state.telegram = config;
  } else if (platform === "whatsapp") {
    const config = await setupWhatsApp();
    if (!config) {
      console.log("\nWhatsApp-Setup abgebrochen.\n");
      return null;
    }
    state.whatsapp = config;
  } else if (platform === "signal") {
    const config = await setupSignal();
    if (!config) {
      console.log("\nSignal-Setup abgebrochen.\n");
      return null;
    }
    state.signal = config;
  }

  // Step 3: Claude Code
  state.claude = await setupClaudeAuth(prereqs.claudeCliOk);

  // Step 4: Summary + .env
  const saved = await showSummary(state);
  if (!saved) {
    console.log("\nKonfiguration wurde nicht gespeichert.\n");
  }

  return state;
}
