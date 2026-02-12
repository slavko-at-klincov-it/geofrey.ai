import { existsSync, copyFileSync, writeFileSync } from "node:fs";
import { stepHeader, success, info, box } from "../utils/ui.js";
import { askYesNo } from "../utils/prompt.js";
import type { WizardState } from "../wizard.js";
import { t } from "../../i18n/index.js";

export function generateEnv(state: WizardState): string {
  const lines: string[] = [
    "# geofrey.ai — generiert von pnpm setup",
    "",
  ];

  // Locale
  lines.push("# Locale");
  lines.push(`LOCALE=${state.locale}`);
  lines.push("");

  // Platform
  lines.push("# Platform");
  lines.push(`PLATFORM=${state.platform}`);
  lines.push("");

  // Telegram
  if (state.platform === "telegram" && state.telegram) {
    lines.push("# Telegram");
    lines.push(`TELEGRAM_BOT_TOKEN=${state.telegram.botToken}`);
    lines.push(`TELEGRAM_OWNER_ID=${state.telegram.ownerId}`);
    lines.push("");
  }

  // WhatsApp
  if (state.platform === "whatsapp" && state.whatsapp) {
    lines.push("# WhatsApp Business API");
    lines.push(`WHATSAPP_PHONE_NUMBER_ID=${state.whatsapp.phoneNumberId}`);
    lines.push(`WHATSAPP_ACCESS_TOKEN=${state.whatsapp.accessToken}`);
    lines.push(`WHATSAPP_VERIFY_TOKEN=${state.whatsapp.verifyToken}`);
    lines.push(`WHATSAPP_OWNER_PHONE=${state.whatsapp.ownerPhone}`);
    lines.push(`WHATSAPP_WEBHOOK_PORT=${state.whatsapp.webhookPort}`);
    lines.push("");
  }

  // Signal
  if (state.platform === "signal" && state.signal) {
    lines.push("# Signal");
    lines.push(`SIGNAL_CLI_SOCKET=${state.signal.signalCliSocket}`);
    lines.push(`SIGNAL_OWNER_PHONE=${state.signal.ownerPhone}`);
    lines.push(`SIGNAL_BOT_PHONE=${state.signal.botPhone}`);
    lines.push("");
  }

  // Ollama
  lines.push("# Ollama");
  lines.push(`OLLAMA_BASE_URL=${state.ollamaUrl}`);
  lines.push(`ORCHESTRATOR_MODEL=${state.model}`);
  lines.push("");

  // Claude Code
  if (state.claude) {
    lines.push("# Claude Code");
    lines.push(`CLAUDE_CODE_ENABLED=${state.claude.enabled}`);
    if (state.claude.apiKey) {
      lines.push(`ANTHROPIC_API_KEY=${state.claude.apiKey}`);
    }
    lines.push("");
  }

  // Defaults
  lines.push("# Database");
  lines.push("DATABASE_URL=./data/app.db");
  lines.push("");
  lines.push("# Audit");
  lines.push("AUDIT_LOG_DIR=./data/audit");
  lines.push("");

  return lines.join("\n") + "\n";
}

function buildSummaryLines(state: WizardState): string[] {
  const lines: string[] = [];
  lines.push(`${t("onboarding.summaryPlatform").padEnd(15)}${state.platform}`);

  if (state.telegram) {
    lines.push(`${t("onboarding.summaryBot").padEnd(15)}@${state.telegram.botUsername}`);
    lines.push(`${t("onboarding.summaryOwnerId").padEnd(15)}${state.telegram.ownerId}`);
  }
  if (state.whatsapp) {
    lines.push(`${t("onboarding.summaryPhoneId").padEnd(15)}${state.whatsapp.phoneNumberId}`);
    lines.push(`${t("onboarding.summaryOwner").padEnd(15)}${state.whatsapp.ownerPhone}`);
  }
  if (state.signal) {
    lines.push(`${t("onboarding.summaryOwner").padEnd(15)}${state.signal.ownerPhone}`);
    lines.push(`${t("onboarding.summaryBot").padEnd(15)}${state.signal.botPhone}`);
  }

  lines.push(`${t("onboarding.summaryOllama").padEnd(15)}${state.ollamaUrl}`);
  lines.push(`${t("onboarding.summaryModel").padEnd(15)}${state.model}`);

  if (state.claude) {
    if (state.claude.authMethod === "api_key" && state.claude.apiKey) {
      lines.push(t("onboarding.summaryClaudeApiKey", { preview: state.claude.apiKey.slice(0, 10) }));
    } else if (state.claude.authMethod === "subscription") {
      lines.push(t("onboarding.summaryClaudeSubscription"));
    } else {
      lines.push(t("onboarding.summaryClaudeDisabled"));
    }
  }

  return lines;
}

export async function showSummary(state: WizardState, envPath = ".env"): Promise<boolean> {
  stepHeader(4, t("onboarding.summaryTitle"));

  box(buildSummaryLines(state));

  const save = await askYesNo(`\n${t("onboarding.savePrompt")}`);
  if (!save) return false;

  // Backup existing .env
  if (existsSync(envPath)) {
    const backup = `${envPath}.backup.${Date.now()}`;
    copyFileSync(envPath, backup);
    info(t("onboarding.backupCreated", { path: backup }));
  }

  const envContent = generateEnv(state);
  writeFileSync(envPath, envContent, "utf-8");
  success(t("onboarding.envSaved"));

  return true;
}
