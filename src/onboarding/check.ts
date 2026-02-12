import { execa } from "execa";
import type { Config } from "../config/schema.js";

export interface OnboardingResult {
  ready: boolean;
  authMethod: "api_key" | "subscription" | "none";
  message: string;
}

export async function checkClaudeCodeReady(
  config: Config["claude"],
): Promise<OnboardingResult> {
  if (!config.enabled) {
    return {
      ready: true,
      authMethod: "none",
      message: "Claude Code: Deaktiviert (CLAUDE_CODE_ENABLED=false)",
    };
  }

  // Check if claude binary exists
  try {
    await execa("claude", ["--version"]);
  } catch {
    return {
      ready: false,
      authMethod: "none",
      message: [
        "Claude Code: FEHLER — 'claude' nicht gefunden",
        "  → Installieren: npm install -g @anthropic-ai/claude-code",
        "  → Docs: https://docs.anthropic.com/en/docs/claude-code",
      ].join("\n"),
    };
  }

  // API Key mode — skip login check
  if (config.apiKey) {
    return {
      ready: true,
      authMethod: "api_key",
      message: `Claude Code: OK (API Key, ${config.model})`,
    };
  }

  // Subscription mode — test with a quick ping
  try {
    const result = await execa("claude", [
      "--print",
      "--output-format", "json",
      "--max-turns", "1",
      "ping",
    ], { timeout: 30_000, reject: false });

    if (result.exitCode === 0) {
      return {
        ready: true,
        authMethod: "subscription",
        message: `Claude Code: OK (Subscription, ${config.model})`,
      };
    }

    // Non-zero exit → auth issue
    return {
      ready: false,
      authMethod: "none",
      message: [
        "Claude Code: FEHLER — Keine Authentifizierung",
        "  → Option A: Claude Pro/Max/Teams/Enterprise Subscription → 'claude login'",
        "  → Option B: API Key → ANTHROPIC_API_KEY in .env setzen",
        "  → API Key erstellen: https://console.anthropic.com/settings/keys",
      ].join("\n"),
    };
  } catch {
    return {
      ready: false,
      authMethod: "none",
      message: [
        "Claude Code: FEHLER — Keine Authentifizierung",
        "  → Option A: Claude Pro/Max/Teams/Enterprise Subscription → 'claude login'",
        "  → Option B: API Key → ANTHROPIC_API_KEY in .env setzen",
        "  → API Key erstellen: https://console.anthropic.com/settings/keys",
      ].join("\n"),
    };
  }
}
