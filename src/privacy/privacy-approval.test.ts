import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDb, closeDb } from "../db/client.js";
import { listRules } from "./rules-store.js";
import { askPrivacyDecision, recordPrivacyDecision } from "./privacy-approval.js";
import type { MessagingPlatform, ChatId } from "../messaging/platform.js";

let tmpDir: string;
let dbPath: string;
let canLoadSqlite = true;

// Pre-check if better-sqlite3 native module is available
try {
  const tempDir = mkdtempSync(join(tmpdir(), "geofrey-check-"));
  const tempDbPath = join(tempDir, "check.db");
  getDb(tempDbPath);
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
} catch {
  canLoadSqlite = false;
}

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), "geofrey-privacy-approval-test-"));
  dbPath = join(tmpDir, "test.db");
  getDb(dbPath);
}

function cleanup(): void {
  closeDb();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/** Minimal mock platform that captures sent messages. */
function createMockPlatform(): MessagingPlatform & { sentMessages: Array<{ chatId: ChatId; text: string }> } {
  const sentMessages: Array<{ chatId: ChatId; text: string }> = [];
  return {
    sentMessages,
    async sendMessage(chatId: ChatId, text: string) {
      sentMessages.push({ chatId, text });
    },
    async sendApproval() {
      // no-op
    },
    async downloadFile() {
      return Buffer.alloc(0);
    },
    onMessage() {
      // no-op
    },
    async start() {
      // no-op
    },
    async stop() {
      // no-op
    },
  } as unknown as MessagingPlatform & { sentMessages: Array<{ chatId: ChatId; text: string }> };
}

describe("askPrivacyDecision", () => {
  it("returns default decision with anonymize/global", async () => {
    const platform = createMockPlatform();
    const decision = await askPrivacyDecision("chat-1", platform, {
      pattern: "boss@example.com",
      category: "email",
    });

    assert.equal(decision.action, "anonymize");
    assert.equal(decision.scope, "global");
    assert.equal(decision.pattern, "boss@example.com");
    assert.equal(decision.category, "email");
    assert.equal(platform.sentMessages.length, 1);
  });
});

describe(
  "recordPrivacyDecision",
  { skip: !canLoadSqlite ? "better-sqlite3 native module not available" : undefined },
  () => {
    beforeEach(() => {
      setup();
    });

    afterEach(() => {
      cleanup();
    });

    it("creates a rule for anonymize action", () => {
      recordPrivacyDecision(dbPath, {
        pattern: "secret@corp.com",
        category: "email",
        action: "anonymize",
        scope: "global",
      });

      const rules = listRules(dbPath);
      assert.equal(rules.length, 1);
      assert.equal(rules[0].pattern, "secret@corp.com");
      assert.equal(rules[0].category, "email");
      assert.equal(rules[0].action, "anonymize");
      assert.equal(rules[0].scope, "global");
      assert.equal(rules[0].label, "Auto: email detected");
    });

    it("creates a rule for block action with session scope", () => {
      recordPrivacyDecision(dbPath, {
        pattern: "Max Mustermann",
        category: "name",
        action: "block",
        scope: "session",
      });

      const rules = listRules(dbPath);
      assert.equal(rules.length, 1);
      assert.equal(rules[0].action, "block");
      assert.equal(rules[0].scope, "session");
    });

    it("skips allow action — no rule created", () => {
      recordPrivacyDecision(dbPath, {
        pattern: "harmless@example.com",
        category: "email",
        action: "allow",
        scope: "global",
      });

      const rules = listRules(dbPath);
      assert.equal(rules.length, 0);
    });
  },
);
