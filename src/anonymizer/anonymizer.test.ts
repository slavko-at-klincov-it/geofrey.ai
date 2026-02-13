import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectPatterns, detectCustomTerms } from "./patterns.js";
import { buildMappingTable, applyAnonymization } from "./mapping.js";
import { deanonymize, createDeanonymizeStream } from "./deanonymizer.js";
import { anonymize, wrapStreamCallbacks, buildAnonymizerSystemPrompt } from "./anonymizer.js";

// --- Pattern detection tests ---

describe("detectPatterns", () => {
  it("detects API keys", () => {
    const text = "Use key sk-ant-api03-abc123defghijklmnopqrst to authenticate";
    const matches = detectPatterns(text);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].category, "secret");
    assert.ok(matches[0].value.startsWith("sk-ant-"));
  });

  it("detects GitHub tokens", () => {
    const text = "Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const matches = detectPatterns(text);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].category, "secret");
  });

  it("detects Slack tokens", () => {
    const text = "Slack: xoxb-12345-67890-abcdef";
    const matches = detectPatterns(text);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].category, "secret");
  });

  it("detects email addresses", () => {
    const text = "Contact john.doe@acme.com for help";
    const matches = detectPatterns(text);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].category, "email");
    assert.equal(matches[0].value, "john.doe@acme.com");
  });

  it("detects IPv4 addresses (not localhost)", () => {
    const text = "Server at 192.168.1.50 and localhost 127.0.0.1";
    const matches = detectPatterns(text);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].category, "ip");
    assert.equal(matches[0].value, "192.168.1.50");
  });

  it("detects connection strings", () => {
    const text = "DB: postgres://admin:secret@db.acme.com:5432/mydb";
    const matches = detectPatterns(text);
    assert.ok(matches.some(m => m.category === "connection_string"));
  });

  it("detects home directory paths", () => {
    const text = "File at /Users/john/projects/app/src/index.ts";
    const matches = detectPatterns(text);
    assert.ok(matches.some(m => m.category === "path"));
    assert.ok(matches.some(m => m.value.includes("/Users/john")));
  });

  it("respects skipCategories", () => {
    const text = "Server at 192.168.1.50 and john@acme.com";
    const matches = detectPatterns(text, new Set(["ip"]));
    assert.ok(matches.every(m => m.category !== "ip"));
    assert.ok(matches.some(m => m.category === "email"));
  });

  it("returns empty for clean text", () => {
    const text = "Please refactor the login component to use React hooks";
    const matches = detectPatterns(text);
    assert.equal(matches.length, 0);
  });

  it("handles multiple detections of same category", () => {
    const text = "Contact alice@foo.com and bob@bar.com";
    const matches = detectPatterns(text);
    assert.equal(matches.length, 2);
  });
});

describe("detectCustomTerms", () => {
  it("detects exact terms case-insensitively", () => {
    const text = "The AcmeCorp project needs updating";
    const matches = detectCustomTerms(text, ["AcmeCorp"]);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].value, "AcmeCorp");
  });

  it("detects multiple terms", () => {
    const text = "AcmeCorp uses SecretProject for billing";
    const matches = detectCustomTerms(text, ["AcmeCorp", "SecretProject"]);
    assert.equal(matches.length, 2);
  });

  it("returns empty when no terms match", () => {
    const text = "Generic project description";
    const matches = detectCustomTerms(text, ["XyzCorp"]);
    assert.equal(matches.length, 0);
  });
});

// --- Mapping tests ---

describe("buildMappingTable", () => {
  it("creates placeholders for each unique value", () => {
    const table = buildMappingTable([
      { category: "email", value: "alice@foo.com" },
      { category: "email", value: "bob@bar.com" },
    ]);
    assert.equal(table.entries.length, 2);
    assert.equal(table.forward.size, 2);
    assert.equal(table.reverse.size, 2);
    assert.ok(table.entries[0].placeholder.includes("EMAIL_001"));
    assert.ok(table.entries[1].placeholder.includes("EMAIL_002"));
  });

  it("deduplicates same value", () => {
    const table = buildMappingTable([
      { category: "email", value: "alice@foo.com" },
      { category: "email", value: "alice@foo.com" },
    ]);
    assert.equal(table.entries.length, 1);
  });

  it("uses __PRIV_ prefix when __ANON_ exists in text", () => {
    const table = buildMappingTable(
      [{ category: "email", value: "alice@foo.com" }],
      "Text with __ANON_ in it",
    );
    assert.ok(table.entries[0].placeholder.startsWith("__PRIV_"));
  });

  it("uses __ANON_ prefix normally", () => {
    const table = buildMappingTable(
      [{ category: "secret", value: "sk-ant-xyz123" }],
      "Normal text",
    );
    assert.ok(table.entries[0].placeholder.startsWith("__ANON_"));
  });
});

describe("applyAnonymization", () => {
  it("replaces all occurrences of a value", () => {
    const table = buildMappingTable([
      { category: "email", value: "alice@foo.com" },
    ]);
    const result = applyAnonymization(
      "Contact alice@foo.com, reply to alice@foo.com",
      table,
    );
    assert.ok(!result.includes("alice@foo.com"));
    assert.equal(
      (result.match(/__ANON_EMAIL_001__/g) ?? []).length,
      2,
    );
  });
});

// --- De-anonymization tests ---

describe("deanonymize", () => {
  it("restores real values from placeholders", () => {
    const table = buildMappingTable([
      { category: "email", value: "alice@foo.com" },
    ]);
    const anonymized = applyAnonymization("Contact alice@foo.com", table);
    const restored = deanonymize(anonymized, table);
    assert.equal(restored, "Contact alice@foo.com");
  });

  it("handles empty table (passthrough)", () => {
    const table = buildMappingTable([]);
    assert.equal(deanonymize("Hello world", table), "Hello world");
  });
});

describe("createDeanonymizeStream", () => {
  it("handles complete placeholders in single chunk", () => {
    const table = buildMappingTable([
      { category: "email", value: "alice@foo.com" },
    ]);
    const stream = createDeanonymizeStream(table);
    const result = stream.push("Hello __ANON_EMAIL_001__ there");
    assert.equal(result, "Hello alice@foo.com there");
  });

  it("handles placeholder split across chunks", () => {
    const table = buildMappingTable([
      { category: "email", value: "alice@foo.com" },
    ]);
    const stream = createDeanonymizeStream(table);

    const r1 = stream.push("Hello __ANON");
    assert.equal(r1, "Hello ");

    const r2 = stream.push("_EMAIL_001__ there");
    assert.equal(r2, "alice@foo.com there");
  });

  it("flushes remaining buffer", () => {
    const table = buildMappingTable([
      { category: "email", value: "alice@foo.com" },
    ]);
    const stream = createDeanonymizeStream(table);

    stream.push("Hello __ANON");
    const result = stream.flush();
    assert.equal(result, "__ANON"); // incomplete placeholder stays as-is
  });

  it("handles empty table (passthrough)", () => {
    const table = buildMappingTable([]);
    const stream = createDeanonymizeStream(table);
    const result = stream.push("Hello world");
    assert.equal(result, "Hello world");
  });

  it("handles multiple chunks without placeholders", () => {
    const table = buildMappingTable([
      { category: "email", value: "alice@foo.com" },
    ]);
    const stream = createDeanonymizeStream(table);
    assert.equal(stream.push("Hello "), "Hello ");
    assert.equal(stream.push("world"), "world");
    assert.equal(stream.flush(), "");
  });
});

// --- Full round-trip tests ---

describe("anonymize (full pipeline)", () => {
  const baseConfig = {
    enabled: true,
    llmPass: false,
    customTerms: [] as string[],
    skipCategories: [] as string[],
  };

  it("anonymizes and can be de-anonymized (round-trip)", async () => {
    const original = "Deploy to 192.168.1.50 using key sk-ant-api03-abc123defghijklmnopqrst, contact admin@acme.com";
    const result = await anonymize(original, baseConfig);

    assert.ok(result.matchCount > 0);
    assert.ok(!result.text.includes("192.168.1.50"));
    assert.ok(!result.text.includes("admin@acme.com"));
    assert.ok(!result.text.includes("sk-ant-api03"));

    // Round-trip
    const restored = deanonymize(result.text, result.table);
    assert.equal(restored, original);
  });

  it("passes through when disabled", async () => {
    const text = "Secret: sk-ant-api03-abc123defghijklmnopqrst";
    const result = await anonymize(text, { ...baseConfig, enabled: false });
    assert.equal(result.text, text);
    assert.equal(result.matchCount, 0);
  });

  it("anonymizes custom terms", async () => {
    const text = "The AcmeCorp merger with FooCorp is secret";
    const result = await anonymize(text, {
      ...baseConfig,
      customTerms: ["AcmeCorp", "FooCorp"],
    });
    assert.ok(!result.text.includes("AcmeCorp"));
    assert.ok(!result.text.includes("FooCorp"));
    assert.equal(result.matchCount, 2);
  });

  it("respects skipCategories", async () => {
    const text = "Server 192.168.1.50, email admin@acme.com";
    const result = await anonymize(text, {
      ...baseConfig,
      skipCategories: ["ip"],
    });
    assert.ok(result.text.includes("192.168.1.50")); // IP not anonymized
    assert.ok(!result.text.includes("admin@acme.com")); // email still anonymized
  });

  it("handles text with no sensitive data", async () => {
    const text = "Refactor the login component to use React hooks";
    const result = await anonymize(text, baseConfig);
    assert.equal(result.text, text);
    assert.equal(result.matchCount, 0);
  });

  it("handles home directory paths", async () => {
    const text = "Edit /Users/john/clients/acme/project/src/index.ts";
    const result = await anonymize(text, baseConfig);
    assert.ok(!result.text.includes("/Users/john"));
    assert.ok(result.text.includes("src/index.ts")); // relative path preserved
  });
});

// --- Stream callback wrapper tests ---

describe("wrapStreamCallbacks", () => {
  it("wraps onText with de-anonymization", () => {
    const table = buildMappingTable([
      { category: "email", value: "alice@foo.com" },
    ]);
    const received: string[] = [];
    const wrapped = wrapStreamCallbacks(
      { onText: (t) => received.push(t) },
      table,
    );
    wrapped.onText!("Hello __ANON_EMAIL_001__ world");
    assert.ok(received.some(t => t.includes("alice@foo.com")));
  });

  it("passes through with empty table", () => {
    const table = buildMappingTable([]);
    const received: string[] = [];
    const cb = { onText: (t: string) => received.push(t) };
    const wrapped = wrapStreamCallbacks(cb, table);
    assert.equal(wrapped, cb); // same reference, no wrapping
  });
});

// --- System prompt tests ---

describe("buildAnonymizerSystemPrompt", () => {
  it("returns prompt when table has entries", () => {
    const table = buildMappingTable([
      { category: "email", value: "alice@foo.com" },
    ]);
    const prompt = buildAnonymizerSystemPrompt(table);
    assert.ok(prompt);
    assert.ok(prompt.includes("__ANON_*__"));
  });

  it("returns undefined for empty table", () => {
    const table = buildMappingTable([]);
    assert.equal(buildAnonymizerSystemPrompt(table), undefined);
  });
});
