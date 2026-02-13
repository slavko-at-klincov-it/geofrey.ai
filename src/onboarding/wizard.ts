import { banner } from "./utils/ui.js";
import { askChoice } from "./utils/prompt.js";
import { runPrerequisites } from "./steps/prerequisites.js";
import { choosePlatform, type Platform } from "./steps/platform.js";
import { setupTelegram, type TelegramConfig } from "./steps/telegram.js";
import { setupWhatsApp, type WhatsAppConfig } from "./steps/whatsapp.js";
import { setupSignal, type SignalConfig } from "./steps/signal.js";
import { setupClaudeAuth, type ClaudeAuthResult } from "./steps/claude-auth.js";
import { runProfileStep, type ProfileResult } from "./steps/profile.js";
import { runIntegrationsStep, type IntegrationsResult } from "./steps/integrations.js";
import { runProactiveStep, type ProactiveResult } from "./steps/proactive.js";
import { showSummary } from "./steps/summary.js";
import { setLocale, type Locale } from "../i18n/index.js";
import { t } from "../i18n/index.js";

export interface WizardState {
  locale: Locale;
  platform: Platform;
  telegram?: TelegramConfig;
  whatsapp?: WhatsAppConfig;
  signal?: SignalConfig;
  ollamaUrl: string;
  model: string;
  claude?: ClaudeAuthResult;
  profile?: ProfileResult;
  integrations?: IntegrationsResult;
  proactive?: ProactiveResult;
}

async function chooseLocale(): Promise<Locale> {
  return askChoice<Locale>("Language / Sprache:", [
    { name: "Deutsch", value: "de" },
    { name: "English", value: "en" },
  ]);
}

export async function runWizard(): Promise<WizardState | null> {
  // Language selection first (bilingual, hardcoded)
  const locale = await chooseLocale();
  setLocale(locale);

  banner();

  // Step 0: Prerequisites
  const prereqs = await runPrerequisites();
  if (!prereqs.nodeOk) {
    console.log(`\n${t("onboarding.nodeRequired")}\n`);
    return null;
  }

  // Step 1: Platform
  const platform = await choosePlatform();

  // Step 2: Platform-specific setup
  const state: WizardState = {
    locale,
    platform,
    ollamaUrl: "http://localhost:11434",
    model: "qwen3:8b",
  };

  if (platform === "telegram") {
    const config = await setupTelegram();
    if (!config) {
      console.log(`\n${t("onboarding.telegramAborted")}\n`);
      return null;
    }
    state.telegram = config;
  } else if (platform === "whatsapp") {
    const config = await setupWhatsApp();
    if (!config) {
      console.log(`\n${t("onboarding.whatsappAborted")}\n`);
      return null;
    }
    state.whatsapp = config;
  } else if (platform === "signal") {
    const config = await setupSignal();
    if (!config) {
      console.log(`\n${t("onboarding.signalAborted")}\n`);
      return null;
    }
    state.signal = config;
  }

  // Step 3: Claude Code
  state.claude = await setupClaudeAuth(prereqs.claudeCliOk);

  // Step 5: User Profile
  state.profile = await runProfileStep();

  // Step 6: Integrations
  state.integrations = await runIntegrationsStep();

  // Step 7: Proactive Setup
  const hasCalendar = state.integrations?.calendarApp.provider !== "none";
  const hasGoogle = state.integrations?.calendarApp.provider === "google";
  state.proactive = await runProactiveStep(hasCalendar, hasGoogle);

  // Step 8: Summary + .env
  const saved = await showSummary(state);
  if (!saved) {
    console.log(`\n${t("onboarding.configNotSaved")}\n`);
  }

  return state;
}
