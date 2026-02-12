import { execa } from "execa";
import { stepHeader, success, fail, info, spinner } from "../utils/ui.js";
import { askChoice, askSecret, askYesNo } from "../utils/prompt.js";
import { isValidAnthropicKey, validateAnthropicKey } from "../utils/validate.js";
import { readTokenFromClipboard } from "../utils/clipboard.js";
import { captureScreenshot, extractTokenFromImage, cleanupScreenshot } from "../utils/ocr.js";

export interface ClaudeAuthResult {
  enabled: boolean;
  apiKey?: string;
  authMethod: "api_key" | "subscription" | "none";
}

const ANTHROPIC_KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]{20,}/;

async function getApiKey(): Promise<string | null> {
  const method = await askChoice("Wie möchtest du den API Key eingeben?", [
    { name: "Direkt eintippen/einfügen", value: "direct" },
    { name: "Aus der Zwischenablage lesen", value: "clipboard" },
    { name: "Aus einem Screenshot extrahieren (OCR)", value: "ocr" },
  ]);

  if (method === "direct") {
    const key = await askSecret("API Key:");
    return key.trim();
  }

  if (method === "clipboard") {
    const spin = spinner("Zwischenablage wird gelesen...");
    const key = await readTokenFromClipboard(ANTHROPIC_KEY_PATTERN);
    if (key) {
      spin.succeed("API Key in Zwischenablage gefunden");
      const use = await askYesNo(`Key verwenden? (${key.slice(0, 12)}...)`);
      return use ? key : null;
    }
    spin.fail("Kein API Key in der Zwischenablage gefunden");
    return null;
  }

  if (method === "ocr") {
    info("Erstelle einen Screenshot des API Keys...");
    const path = await captureScreenshot();
    if (!path) { fail("Screenshot konnte nicht erstellt werden"); return null; }
    const spin = spinner("API Key wird aus Screenshot extrahiert...");
    const key = await extractTokenFromImage(path, "anthropic");
    cleanupScreenshot(path);
    if (key) {
      spin.succeed("API Key extrahiert");
      const use = await askYesNo(`Key verwenden? (${key.slice(0, 12)}...)`);
      return use ? key : null;
    }
    spin.fail("Kein API Key im Screenshot gefunden");
    return null;
  }

  return null;
}

export async function setupClaudeAuth(cliAvailable: boolean): Promise<ClaudeAuthResult> {
  stepHeader(3, "Claude Code");

  const authMethod = await askChoice("Claude Code Authentifizierung:", [
    { name: "API Key (ANTHROPIC_API_KEY)", value: "api_key" as const },
    { name: "Subscription (claude login)", value: "subscription" as const },
    { name: "Überspringen", value: "none" as const },
  ]);

  if (authMethod === "none") {
    return { enabled: false, authMethod: "none" };
  }

  if (authMethod === "api_key") {
    let apiKey: string | null = null;

    while (!apiKey) {
      const key = await getApiKey();
      if (!key) {
        const retry = await askYesNo("Erneut versuchen?");
        if (!retry) return { enabled: false, authMethod: "none" };
        continue;
      }

      if (!isValidAnthropicKey(key)) {
        fail("Ungültiges Key-Format (erwartet: sk-ant-...)");
        continue;
      }

      const spin = spinner("API Key wird validiert...");
      const valid = await validateAnthropicKey(key);
      if (valid) {
        spin.succeed("API Key gültig");
        apiKey = key;
      } else {
        spin.fail("API Key ungültig — von Anthropic abgelehnt");
      }
    }

    return { enabled: true, apiKey, authMethod: "api_key" };
  }

  // Subscription
  if (!cliAvailable) {
    fail("Claude Code CLI nicht installiert — Subscription-Login nicht möglich");
    info("→ npm install -g @anthropic-ai/claude-code");
    return { enabled: false, authMethod: "none" };
  }

  console.log("\n  Führe 'claude login' in einem anderen Terminal aus.");
  console.log("  Drücke Enter wenn du eingeloggt bist.\n");

  await askYesNo("Login abgeschlossen?");

  // Verify login
  const spin = spinner("Login wird geprüft...");
  try {
    const result = await execa("claude", [
      "--print", "--output-format", "json", "--max-turns", "1", "ping",
    ], { timeout: 30_000, reject: false });

    if (result.exitCode === 0) {
      spin.succeed("Claude Code Subscription aktiv");
      return { enabled: true, authMethod: "subscription" };
    }
    spin.fail("Login nicht erkannt — prüfe mit 'claude --version'");
  } catch {
    spin.fail("Prüfung fehlgeschlagen");
  }

  return { enabled: false, authMethod: "none" };
}
