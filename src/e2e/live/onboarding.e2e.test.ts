import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidTelegramToken,
  isValidAnthropicKey,
  validateOllamaConnection,
} from "../../onboarding/utils/validate.js";
import { configSchema } from "../../config/schema.js";

describe("E2E: Onboarding & Validation", { timeout: 30_000 }, () => {
  it("Node.js version is >=22", () => {
    const nodeVersion = parseInt(process.version.slice(1), 10);
    assert.ok(nodeVersion >= 22, `Expected Node.js >=22, got ${process.version}`);
  });

  it("Ollama connection detection (live check)", async () => {
    const result = await validateOllamaConnection(
      process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    );
    // We don't assert connected=true because Ollama might not be running
    // But the function should return a valid result object
    assert.ok(typeof result.connected === "boolean");
    assert.ok(Array.isArray(result.models));
    if (result.connected) {
      assert.ok(result.models.length > 0, "Connected Ollama should have at least one model");
    }
  });

  it("validates correct Telegram token format", () => {
    // Token format: 8-12 digits : exactly 35 alphanumeric/dash/underscore chars
    assert.equal(isValidTelegramToken("1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi"), true);
    assert.equal(isValidTelegramToken("12345678:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefgh"), true);
  });

  it("rejects invalid Telegram tokens", () => {
    assert.equal(isValidTelegramToken(""), false);
    assert.equal(isValidTelegramToken("not-a-token"), false);
    assert.equal(isValidTelegramToken("123:short"), false);
  });

  it("validates correct Anthropic key format", () => {
    assert.equal(isValidAnthropicKey("sk-ant-abcdefghijklmnopqrstuvwxyz"), true);
    assert.equal(isValidAnthropicKey("sk-ant-1234567890abcdefghijklmnop"), true);
  });

  it("rejects invalid Anthropic keys", () => {
    assert.equal(isValidAnthropicKey(""), false);
    assert.equal(isValidAnthropicKey("not-a-key"), false);
    assert.equal(isValidAnthropicKey("sk-short"), false);
  });

  it("config schema parses with all defaults populated", () => {
    // Required top-level objects (no .default({}) on these)
    const minimal = {
      telegram: {
        botToken: "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
        ownerId: 123456789,
      },
      ollama: {},
      database: {},
      audit: {},
      limits: {},
      claude: {},
      mcp: { allowedServers: [] },
    };

    const config = configSchema.parse(minimal);
    // Verify defaults from nested objects
    assert.equal(config.locale, "de");
    assert.equal(config.platform, "telegram");
    assert.equal(config.ollama.baseUrl, "http://localhost:11434");
    assert.equal(config.ollama.model, "qwen3:8b");
    assert.equal(config.ollama.numCtx, 16384);
    assert.equal(config.database.url, "./data/app.db");
    assert.equal(config.limits.maxAgentSteps, 15);
    assert.equal(config.claude.enabled, true);
    assert.equal(config.claude.outputFormat, "stream-json");
    // Optional subsections get defaults via .default({})
    assert.equal(config.anonymizer.enabled, false);
    assert.equal(config.sandbox.enabled, false);
    assert.equal(config.dashboard.enabled, false);
  });
});
