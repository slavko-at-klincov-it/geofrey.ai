import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { anonymize, type AnonymizerConfig } from "../../anonymizer/anonymizer.js";
import { deanonymize } from "../../anonymizer/deanonymizer.js";
import { filterOutput } from "../../privacy/output-filter.js";
import { ensureOllama } from "./helpers/ollama-guard.js";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";
import { DUMMY_PII_TEXTS, DUMMY_EMAILS } from "./helpers/fixtures.js";

describe("E2E: Anonymizer", { timeout: 60_000 }, () => {
  let env: TestEnv;
  let ollamaAvailable = false;

  before(async () => {
    env = await createTestEnv();
    const guard = await ensureOllama();
    ollamaAvailable = !guard.skip;
  });

  after(async () => {
    await env.cleanup();
  });

  it("regex-only anonymization replaces emails, API keys, IPs", async () => {
    const text = DUMMY_PII_TEXTS.join("\n");
    const config: AnonymizerConfig = {
      enabled: true,
      llmPass: false,
      customTerms: [],
      skipCategories: [],
    };

    const result = await anonymize(text, config);
    assert.ok(result.matchCount > 0, "Should detect at least one pattern");
    assert.ok(!result.text.includes("max.testmann@example.com"), "Email should be anonymized");
    assert.ok(!result.text.includes("sk-ant-api03-xyzABCDEFghijKLMNOP1234567890"), "API key should be anonymized");
    assert.ok(!result.text.includes("192.168.1.100"), "IP should be anonymized");
    assert.ok(result.text.includes("__ANON_"), "Should contain ANON placeholders");
  });

  it("anonymizes custom terms (names)", async () => {
    const text = "Max Testmann hat das Projekt gestartet. Kontakt: Max Testmann.";
    const config: AnonymizerConfig = {
      enabled: true,
      llmPass: false,
      customTerms: ["Max Testmann"],
      skipCategories: [],
    };

    const result = await anonymize(text, config);
    assert.ok(!result.text.includes("Max Testmann"), "Name should be anonymized");
    assert.ok(result.text.includes("__ANON_CUSTOM_001__"), "Should use CUSTOM placeholder");
  });

  it("LLM name extraction finds at least one name (Ollama required)", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available");
      return;
    }

    const text = "Hans Müller hat heute die Präsentation gehalten. Maria Schmidt war auch dabei.";
    const config: AnonymizerConfig = {
      enabled: true,
      llmPass: true,
      customTerms: [],
      skipCategories: [],
      ollama: {
        ollamaBaseUrl: env.config.ollama.baseUrl,
        ollamaModel: env.config.ollama.model,
      },
    };

    const result = await anonymize(text, config);
    // LLM should detect at least one name — non-deterministic, so we check matchCount > 0
    assert.ok(result.matchCount > 0, "LLM should detect at least one name");
  });

  it("round-trip: anonymize then deanonymize restores original", async () => {
    const original = "Kontakt: max.testmann@example.com, Server: 192.168.1.100";
    const config: AnonymizerConfig = {
      enabled: true,
      llmPass: false,
      customTerms: [],
      skipCategories: [],
    };

    const { text: anonymized, table } = await anonymize(original, config);
    assert.notEqual(anonymized, original, "Should be anonymized");

    const restored = deanonymize(anonymized, table);
    assert.equal(restored, original, "Deanonymization should restore original");
  });

  it("output filter redacts leaked API keys", () => {
    const leaked = "Here is the key: sk-ant-api03-xyzABCDEFghijKLMNOP1234567890 and token ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const result = filterOutput(leaked);
    assert.ok(result.redactedCount > 0, "Should redact at least one credential");
    assert.ok(!result.text.includes("sk-ant-api03"), "API key should be redacted");
    assert.ok(result.text.includes("[REDACTED]"), "Should contain [REDACTED]");
  });

  it("output filter passes clean text through", () => {
    const clean = "This is a normal response with no credentials.";
    const result = filterOutput(clean);
    assert.equal(result.redactedCount, 0);
    assert.equal(result.text, clean);
  });

  it("anonymizes email with embedded secrets (Ollama required for LLM pass)", async () => {
    const emailBody = DUMMY_EMAILS[0].body!;
    const config: AnonymizerConfig = {
      enabled: true,
      llmPass: false,
      customTerms: [],
      skipCategories: [],
    };

    const result = await anonymize(emailBody, config);
    assert.ok(!result.text.includes("sk-ant-api03"), "API key in email should be anonymized");
    assert.ok(!result.text.includes("S3cret!Pass"), "DB password should be anonymized");
    assert.ok(result.matchCount >= 2, "Should detect API key + connection string");
  });
});
