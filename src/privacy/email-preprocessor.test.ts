import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeEmail, sanitizeEmails, formatEmailForLlm, type SanitizedEmail } from "./email-preprocessor.js";
import type { GmailMessage } from "../integrations/google/gmail.js";
import type { AnonymizerConfig } from "../anonymizer/anonymizer.js";

// --- Helpers ---

function makeEmail(overrides: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id: "msg-001",
    threadId: "thread-001",
    subject: "Meeting with John",
    from: "john.doe@acme.com",
    to: "jane.smith@corp.org",
    date: "2026-02-14T10:00:00Z",
    snippet: "Hi Jane, let's discuss the project",
    body: "Hi Jane,\n\nPlease review the document.\n\nBest,\nJohn",
    labelIds: ["INBOX", "UNREAD"],
    ...overrides,
  };
}

const ANON_CONFIG: AnonymizerConfig = {
  enabled: true,
  llmPass: false,
  customTerms: [],
  skipCategories: [],
};

const DISABLED_CONFIG: AnonymizerConfig = {
  enabled: false,
  llmPass: false,
  customTerms: [],
  skipCategories: [],
};

// --- sanitizeEmail ---

describe("sanitizeEmail", () => {
  it("anonymizes from/to email addresses", async () => {
    const email = makeEmail();
    const result = await sanitizeEmail(email, ANON_CONFIG);

    // Email addresses should be replaced with __ANON_EMAIL_xxx__ placeholders
    assert.ok(!result.from.includes("john.doe@acme.com"), "from should be anonymized");
    assert.ok(!result.to.includes("jane.smith@corp.org"), "to should be anonymized");
    assert.ok(result.from.includes("__ANON_EMAIL_") || result.from.includes("__PRIV_EMAIL_"),
      "from should contain email placeholder");
  });

  it("preserves email id, threadId, date, and labelIds", async () => {
    const email = makeEmail();
    const result = await sanitizeEmail(email, ANON_CONFIG);

    assert.equal(result.id, "msg-001");
    assert.equal(result.threadId, "thread-001");
    assert.equal(result.date, "2026-02-14T10:00:00Z");
    assert.deepEqual(result.labelIds, ["INBOX", "UNREAD"]);
  });

  it("handles missing body gracefully", async () => {
    const email = makeEmail({ body: undefined });
    const result = await sanitizeEmail(email, ANON_CONFIG);

    assert.equal(result.body, undefined);
    assert.ok(result.snippet.length > 0, "snippet should still exist");
  });

  it("returns mapping table with entries", async () => {
    const email = makeEmail();
    const result = await sanitizeEmail(email, ANON_CONFIG);

    assert.ok(result.mappingTable.entries.length > 0, "should have mapping entries for emails");
    assert.ok(result.mappingTable.forward.size > 0, "forward map should have entries");
    assert.ok(result.mappingTable.reverse.size > 0, "reverse map should have entries");
  });

  it("passes through unchanged when anonymizer is disabled", async () => {
    const email = makeEmail();
    const result = await sanitizeEmail(email, DISABLED_CONFIG);

    assert.equal(result.from, "john.doe@acme.com");
    assert.equal(result.to, "jane.smith@corp.org");
    assert.equal(result.subject, "Meeting with John");
    assert.equal(result.mappingTable.entries.length, 0);
  });
});

// --- sanitizeEmails ---

describe("sanitizeEmails", () => {
  it("processes multiple emails", async () => {
    const emails = [
      makeEmail({ id: "msg-001", from: "alice@example.com" }),
      makeEmail({ id: "msg-002", from: "bob@example.com" }),
    ];
    const results = await sanitizeEmails(emails, ANON_CONFIG);

    assert.equal(results.length, 2);
    assert.equal(results[0].id, "msg-001");
    assert.equal(results[1].id, "msg-002");
    // Both should have anonymized from fields
    assert.ok(!results[0].from.includes("alice@example.com"));
    assert.ok(!results[1].from.includes("bob@example.com"));
  });
});

// --- formatEmailForLlm ---

describe("formatEmailForLlm", () => {
  it("produces readable header + body output", () => {
    const email: SanitizedEmail = {
      id: "msg-001",
      threadId: "thread-001",
      subject: "Project Update",
      from: "__ANON_EMAIL_001__",
      to: "__ANON_EMAIL_002__",
      date: "2026-02-14T10:00:00Z",
      snippet: "Summary of changes",
      body: "Here are the updates for this week.",
      labelIds: ["INBOX"],
      mappingTable: { entries: [], forward: new Map(), reverse: new Map() },
    };

    const output = formatEmailForLlm(email);

    assert.ok(output.includes("From: __ANON_EMAIL_001__"));
    assert.ok(output.includes("To: __ANON_EMAIL_002__"));
    assert.ok(output.includes("Date: 2026-02-14T10:00:00Z"));
    assert.ok(output.includes("Subject: Project Update"));
    assert.ok(output.includes("Here are the updates for this week."));
  });

  it("falls back to snippet when body is missing", () => {
    const email: SanitizedEmail = {
      id: "msg-001",
      threadId: "thread-001",
      subject: "Quick Question",
      from: "sender",
      to: "receiver",
      date: "2026-02-14",
      snippet: "Can you review this?",
      body: undefined,
      labelIds: [],
      mappingTable: { entries: [], forward: new Map(), reverse: new Map() },
    };

    const output = formatEmailForLlm(email);

    assert.ok(output.includes("Can you review this?"));
    assert.ok(!output.includes("undefined"));
  });
});
