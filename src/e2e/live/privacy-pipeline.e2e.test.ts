import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { sanitizeEmail, formatEmailForLlm } from "../../privacy/email-preprocessor.js";
import { filterOutput } from "../../privacy/output-filter.js";
import { createRule, listRules, deleteRule } from "../../privacy/rules-store.js";
import { anonymize, type AnonymizerConfig } from "../../anonymizer/anonymizer.js";
import { getDb } from "../../db/client.js";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";
import { DUMMY_EMAILS, DUMMY_PROFILE } from "./helpers/fixtures.js";
import type { GmailMessage } from "../../integrations/google/gmail.js";

describe("E2E: Privacy Pipeline", { timeout: 60_000 }, () => {
  let env: TestEnv;

  before(async () => {
    env = await createTestEnv();
    // Initialize DB (triggers migrations)
    getDb(env.dbUrl);
  });

  after(async () => {
    await env.cleanup();
  });

  it("sanitizes email with PII via anonymizer pipeline", async () => {
    const email = DUMMY_EMAILS[0] as GmailMessage;
    const config: AnonymizerConfig = {
      enabled: true,
      llmPass: false,
      customTerms: [],
      skipCategories: [],
    };

    const sanitized = await sanitizeEmail(email, config);
    assert.ok(!sanitized.from.includes("hans.mueller@firma.de"), "Sender email should be anonymized");
    assert.ok(!sanitized.to.includes("max.testmann@example.com"), "Recipient should be anonymized");
    assert.ok(sanitized.body, "Body should exist");
    assert.ok(!sanitized.body!.includes("sk-ant-api03"), "API key in body should be anonymized");
    assert.ok(sanitized.mappingTable.entries.length > 0, "Mapping table should have entries");
  });

  it("output filter catches leaked credentials", () => {
    const output = `Result: The API key is sk-ant-api03-xyzABCDEFghijKLMNOP1234567890 and the GitHub token is ghp_abcdefghijklmnopqrstuvwxyz1234567890.`;
    const result = filterOutput(output);
    assert.ok(result.redactedCount >= 2, `Expected >=2 redactions, got ${result.redactedCount}`);
    assert.ok(!result.text.includes("sk-ant-api03"), "API key should be redacted");
    assert.ok(result.text.includes("[REDACTED]"));
  });

  it("privacy rules CRUD works", () => {
    // Create
    const rule = createRule(env.dbUrl, {
      category: "email",
      pattern: "test@example.com",
      action: "anonymize",
      scope: "global",
      label: "Test email",
    });
    assert.ok(rule.id);
    assert.equal(rule.action, "anonymize");

    // List
    const rules = listRules(env.dbUrl);
    assert.ok(rules.some((r) => r.id === rule.id), "Created rule should be in list");

    // Delete
    const deleted = deleteRule(env.dbUrl, rule.id);
    assert.equal(deleted, true);

    // Verify gone
    const rulesAfter = listRules(env.dbUrl);
    assert.ok(!rulesAfter.some((r) => r.id === rule.id), "Deleted rule should be gone");
  });

  it("allow-rule prevents anonymization of matching pattern", async () => {
    // Create an "allow" rule for a specific email
    const allowRule = createRule(env.dbUrl, {
      category: "email",
      pattern: "allowed@example.com",
      action: "allow",
    });

    const text = "Contact allowed@example.com and secret@example.com for details.";
    const config: AnonymizerConfig = {
      enabled: true,
      llmPass: false,
      customTerms: [],
      skipCategories: [],
      dbUrl: env.dbUrl,
    };

    const result = await anonymize(text, config);
    assert.ok(result.text.includes("allowed@example.com"), "Allowed email should remain");
    assert.ok(!result.text.includes("secret@example.com"), "Non-allowed email should be anonymized");

    deleteRule(env.dbUrl, allowRule.id);
  });

  it("block-rule forces anonymization of matching pattern", async () => {
    const blockRule = createRule(env.dbUrl, {
      category: "custom",
      pattern: "TopSecret",
      action: "block",
    });

    const text = "The project is called TopSecret and it's very important.";
    const config: AnonymizerConfig = {
      enabled: true,
      llmPass: false,
      customTerms: [],
      skipCategories: [],
      dbUrl: env.dbUrl,
    };

    const result = await anonymize(text, config);
    assert.ok(!result.text.includes("TopSecret"), "Blocked term should be anonymized");

    deleteRule(env.dbUrl, blockRule.id);
  });

  it("formats sanitized email for LLM consumption", async () => {
    const email = DUMMY_EMAILS[1] as GmailMessage;
    const config: AnonymizerConfig = {
      enabled: true,
      llmPass: false,
      customTerms: [],
      skipCategories: [],
    };

    const sanitized = await sanitizeEmail(email, config);
    const formatted = formatEmailForLlm(sanitized);

    assert.ok(formatted.startsWith("From:"), "Should start with From:");
    assert.ok(formatted.includes("To:"), "Should contain To:");
    assert.ok(formatted.includes("Subject:"), "Should contain Subject:");
    assert.ok(formatted.includes("Date:"), "Should contain Date:");
    // Email addresses should be anonymized
    assert.ok(!formatted.includes("partner@example.com") || !formatted.includes("max.testmann@example.com"),
      "At least some emails should be anonymized in formatted output");
  });
});
