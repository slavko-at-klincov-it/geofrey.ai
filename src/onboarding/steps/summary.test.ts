import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateEnv } from "./summary.js";
import type { WizardState } from "../wizard.js";
import { writeFileSync, existsSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    platform: "telegram",
    telegram: { botToken: "12345678:ABCDefgh_ijklmnopqrstuvwxyz12345678", ownerId: 42, botUsername: "test_bot" },
    ollamaUrl: "http://localhost:11434",
    model: "qwen3:8b",
    claude: { enabled: true, apiKey: "sk-ant-test-key_1234567890abcde", authMethod: "api_key" },
    ...overrides,
  };
}

describe("generateEnv", () => {
  it("generates telegram config", () => {
    const env = generateEnv(makeState());
    assert.ok(env.includes("PLATFORM=telegram"));
    assert.ok(env.includes("TELEGRAM_BOT_TOKEN=12345678:ABCDefgh_ijklmnopqrstuvwxyz12345678"));
    assert.ok(env.includes("TELEGRAM_OWNER_ID=42"));
  });

  it("generates whatsapp config", () => {
    const env = generateEnv(makeState({
      platform: "whatsapp",
      telegram: undefined,
      whatsapp: {
        phoneNumberId: "12345",
        accessToken: "token",
        verifyToken: "verify",
        ownerPhone: "491234567890",
        webhookPort: 3000,
      },
    }));
    assert.ok(env.includes("PLATFORM=whatsapp"));
    assert.ok(env.includes("WHATSAPP_PHONE_NUMBER_ID=12345"));
    assert.ok(env.includes("WHATSAPP_OWNER_PHONE=491234567890"));
  });

  it("generates signal config", () => {
    const env = generateEnv(makeState({
      platform: "signal",
      telegram: undefined,
      signal: {
        signalCliSocket: "/var/run/signal-cli/socket",
        ownerPhone: "+491234567890",
        botPhone: "+491234567891",
      },
    }));
    assert.ok(env.includes("PLATFORM=signal"));
    assert.ok(env.includes("SIGNAL_OWNER_PHONE=+491234567890"));
  });

  it("includes claude API key when set", () => {
    const env = generateEnv(makeState());
    assert.ok(env.includes("ANTHROPIC_API_KEY=sk-ant-test-key_1234567890abcde"));
    assert.ok(env.includes("CLAUDE_CODE_ENABLED=true"));
  });

  it("omits API key when disabled", () => {
    const env = generateEnv(makeState({ claude: { enabled: false, authMethod: "none" } }));
    assert.ok(env.includes("CLAUDE_CODE_ENABLED=false"));
    assert.ok(!env.includes("ANTHROPIC_API_KEY"));
  });

  it("includes ollama defaults", () => {
    const env = generateEnv(makeState());
    assert.ok(env.includes("OLLAMA_BASE_URL=http://localhost:11434"));
    assert.ok(env.includes("ORCHESTRATOR_MODEL=qwen3:8b"));
  });

  it("includes database and audit defaults", () => {
    const env = generateEnv(makeState());
    assert.ok(env.includes("DATABASE_URL=./data/app.db"));
    assert.ok(env.includes("AUDIT_LOG_DIR=./data/audit"));
  });

  it("env is valid text with trailing newline", () => {
    const env = generateEnv(makeState());
    assert.ok(env.endsWith("\n"));
    // No empty lines at the very end (just one newline)
    assert.ok(!env.endsWith("\n\n\n"));
  });
});
