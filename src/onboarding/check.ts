import { execa } from "execa";
import type { Config } from "../config/schema.js";
import { t } from "../i18n/index.js";

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
      message: t("check.disabled"),
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
        t("check.notFound"),
        t("check.notFoundInstall"),
        t("check.notFoundDocs"),
      ].join("\n"),
    };
  }

  // API Key mode — skip login check
  if (config.apiKey) {
    return {
      ready: true,
      authMethod: "api_key",
      message: t("check.okApiKey", { model: config.model }),
    };
  }

  // Subscription mode — test with a quick ping
  const noAuthMessage = [
    t("check.noAuth"),
    t("check.authOptionA"),
    t("check.authOptionB"),
    t("check.authCreateKey"),
  ].join("\n");

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
        message: t("check.okSubscription", { model: config.model }),
      };
    }

    return {
      ready: false,
      authMethod: "none",
      message: noAuthMessage,
    };
  } catch {
    return {
      ready: false,
      authMethod: "none",
      message: noAuthMessage,
    };
  }
}
