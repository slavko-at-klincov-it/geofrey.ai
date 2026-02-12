import { execa } from "execa";
import { stepHeader, success, fail, info, spinner } from "../utils/ui.js";
import { askChoice, askSecret, askYesNo } from "../utils/prompt.js";
import { isValidAnthropicKey, validateAnthropicKey } from "../utils/validate.js";
import { readTokenFromClipboard } from "../utils/clipboard.js";
import { captureScreenshot, extractTokenFromImage, cleanupScreenshot } from "../utils/ocr.js";
import { t } from "../../i18n/index.js";

export interface ClaudeAuthResult {
  enabled: boolean;
  apiKey?: string;
  authMethod: "api_key" | "subscription" | "none";
}

const ANTHROPIC_KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]{20,}/;

async function getApiKey(): Promise<string | null> {
  const method = await askChoice(t("onboarding.apiKeyInputMethod"), [
    { name: t("onboarding.apiKeyDirect"), value: "direct" },
    { name: t("onboarding.apiKeyClipboard"), value: "clipboard" },
    { name: t("onboarding.apiKeyOcr"), value: "ocr" },
  ]);

  if (method === "direct") {
    const key = await askSecret(t("onboarding.apiKeyPrompt"));
    return key.trim();
  }

  if (method === "clipboard") {
    const spin = spinner(t("onboarding.clipboardReading"));
    const key = await readTokenFromClipboard(ANTHROPIC_KEY_PATTERN);
    if (key) {
      spin.succeed(t("onboarding.apiKeyClipboardFound"));
      const use = await askYesNo(t("onboarding.apiKeyUseConfirm", { preview: key.slice(0, 12) }));
      return use ? key : null;
    }
    spin.fail(t("onboarding.apiKeyClipboardNotFound"));
    return null;
  }

  if (method === "ocr") {
    info(t("onboarding.apiKeyOcrHint"));
    const path = await captureScreenshot();
    if (!path) { fail(t("onboarding.screenshotFailed")); return null; }
    const spin = spinner(t("onboarding.apiKeyOcrExtracting"));
    const key = await extractTokenFromImage(path, "anthropic");
    cleanupScreenshot(path);
    if (key) {
      spin.succeed(t("onboarding.apiKeyOcrExtracted"));
      const use = await askYesNo(t("onboarding.apiKeyUseConfirm", { preview: key.slice(0, 12) }));
      return use ? key : null;
    }
    spin.fail(t("onboarding.apiKeyOcrNotFound"));
    return null;
  }

  return null;
}

export async function setupClaudeAuth(cliAvailable: boolean): Promise<ClaudeAuthResult> {
  stepHeader(3, t("onboarding.claudeTitle"));

  const authMethod = await askChoice(t("onboarding.claudeAuthPrompt"), [
    { name: t("onboarding.claudeAuthApiKey"), value: "api_key" as const },
    { name: t("onboarding.claudeAuthSubscription"), value: "subscription" as const },
    { name: t("onboarding.claudeAuthSkip"), value: "none" as const },
  ]);

  if (authMethod === "none") {
    return { enabled: false, authMethod: "none" };
  }

  if (authMethod === "api_key") {
    let apiKey: string | null = null;

    while (!apiKey) {
      const key = await getApiKey();
      if (!key) {
        const retry = await askYesNo(t("onboarding.retryPrompt"));
        if (!retry) return { enabled: false, authMethod: "none" };
        continue;
      }

      if (!isValidAnthropicKey(key)) {
        fail(t("onboarding.apiKeyInvalid"));
        continue;
      }

      const spin = spinner(t("onboarding.apiKeyValidating"));
      const valid = await validateAnthropicKey(key);
      if (valid) {
        spin.succeed(t("onboarding.apiKeyValid"));
        apiKey = key;
      } else {
        spin.fail(t("onboarding.apiKeyRejected"));
      }
    }

    return { enabled: true, apiKey, authMethod: "api_key" };
  }

  // Subscription
  if (!cliAvailable) {
    fail(t("onboarding.claudeCliMissing"));
    info("→ npm install -g @anthropic-ai/claude-code");
    return { enabled: false, authMethod: "none" };
  }

  console.log(`\n  ${t("onboarding.subscriptionLogin")}\n`);

  await askYesNo(t("onboarding.loginDone"));

  // Verify login
  const spin = spinner(t("onboarding.loginChecking"));
  try {
    const result = await execa("claude", [
      "--print", "--output-format", "json", "--max-turns", "1", "ping",
    ], { timeout: 30_000, reject: false });

    if (result.exitCode === 0) {
      spin.succeed(t("onboarding.subscriptionActive"));
      return { enabled: true, authMethod: "subscription" };
    }
    spin.fail(t("onboarding.loginNotRecognized"));
  } catch {
    spin.fail(t("onboarding.loginCheckFailed"));
  }

  return { enabled: false, authMethod: "none" };
}
