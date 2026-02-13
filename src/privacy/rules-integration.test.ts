import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDb, closeDb } from "../db/client.js";
import { createRule } from "./rules-store.js";
import { anonymize, type AnonymizerConfig } from "../anonymizer/anonymizer.js";

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
  tmpDir = mkdtempSync(join(tmpdir(), "geofrey-rules-int-"));
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

const baseConfig: AnonymizerConfig = {
  enabled: true,
  llmPass: false,
  customTerms: [],
  skipCategories: [],
};

describe(
  "rules-integration (anonymizer + privacy rules)",
  { skip: !canLoadSqlite ? "better-sqlite3 native module not available" : undefined },
  () => {
    beforeEach(() => {
      setup();
    });

    afterEach(() => {
      cleanup();
    });

    it("anonymize rule adds pattern to detection", async () => {
      createRule(dbPath, {
        category: "name",
        pattern: "SecretProject",
        action: "anonymize",
      });

      const result = await anonymize(
        "Working on SecretProject today",
        { ...baseConfig, dbUrl: dbPath },
      );

      assert.ok(!result.text.includes("SecretProject"), "should anonymize rule pattern");
      assert.ok(result.matchCount > 0);
    });

    it("allow rule prevents anonymization of matching value", async () => {
      // "admin@acme.com" would normally be detected as email
      createRule(dbPath, {
        category: "email",
        pattern: "admin@acme.com",
        action: "allow",
      });

      const result = await anonymize(
        "Contact admin@acme.com for support",
        { ...baseConfig, dbUrl: dbPath },
      );

      assert.ok(result.text.includes("admin@acme.com"), "allowed email should remain");
    });

    it("block rule treats blocked pattern as anonymized", async () => {
      createRule(dbPath, {
        category: "credential",
        pattern: "TopSecret123",
        action: "block",
      });

      const result = await anonymize(
        "The password is TopSecret123",
        { ...baseConfig, dbUrl: dbPath },
      );

      assert.ok(!result.text.includes("TopSecret123"), "blocked term should be anonymized");
    });

    it("works without dbUrl (no rules loaded)", async () => {
      const result = await anonymize(
        "Contact admin@acme.com",
        baseConfig,
      );

      // Email should still be detected by normal regex patterns
      assert.ok(!result.text.includes("admin@acme.com"));
      assert.ok(result.matchCount > 0);
    });

    it("allow rule only whitelists exact match", async () => {
      createRule(dbPath, {
        category: "email",
        pattern: "admin@acme.com",
        action: "allow",
      });

      const result = await anonymize(
        "Contact admin@acme.com and secret@acme.com",
        { ...baseConfig, dbUrl: dbPath },
      );

      assert.ok(result.text.includes("admin@acme.com"), "allowed email stays");
      assert.ok(!result.text.includes("secret@acme.com"), "other email still anonymized");
    });

    it("multiple rules combine correctly", async () => {
      createRule(dbPath, {
        category: "name",
        pattern: "ProjectX",
        action: "anonymize",
      });
      createRule(dbPath, {
        category: "email",
        pattern: "public@acme.com",
        action: "allow",
      });

      const result = await anonymize(
        "ProjectX contact: public@acme.com and private@acme.com",
        { ...baseConfig, dbUrl: dbPath },
      );

      assert.ok(!result.text.includes("ProjectX"), "anonymize rule applied");
      assert.ok(result.text.includes("public@acme.com"), "allow rule applied");
      assert.ok(!result.text.includes("private@acme.com"), "non-allowed email anonymized");
    });

    it("gracefully handles invalid regex in block rule", async () => {
      createRule(dbPath, {
        category: "custom",
        pattern: "[invalid(regex",
        action: "block",
      });

      // Should not throw — the rule lookup catches errors
      const result = await anonymize(
        "Some normal text",
        { ...baseConfig, dbUrl: dbPath },
      );

      assert.ok(result.text === "Some normal text");
    });
  },
);
