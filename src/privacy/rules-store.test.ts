import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDb, closeDb } from "../db/client.js";
import {
  createRule,
  listRules,
  getRule,
  deleteRule,
  findRulesByCategory,
  exportRulesAsMd,
} from "./rules-store.js";

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
  tmpDir = mkdtempSync(join(tmpdir(), "geofrey-privacy-test-"));
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

describe(
  "rules-store",
  { skip: !canLoadSqlite ? "better-sqlite3 native module not available" : undefined },
  () => {
    beforeEach(() => {
      setup();
    });

    afterEach(() => {
      cleanup();
    });

    describe("createRule", () => {
      it("returns a rule with id and createdAt", () => {
        const rule = createRule(dbPath, {
          category: "email",
          pattern: "boss@example.com",
          action: "anonymize",
        });

        assert.ok(rule.id);
        assert.equal(typeof rule.id, "string");
        assert.equal(rule.id.length, 16); // 8 bytes hex
        assert.equal(rule.category, "email");
        assert.equal(rule.pattern, "boss@example.com");
        assert.equal(rule.action, "anonymize");
        assert.equal(rule.scope, "global");
        assert.equal(rule.label, null);
        assert.ok(rule.createdAt);
      });

      it("respects scope and label parameters", () => {
        const rule = createRule(dbPath, {
          category: "name",
          pattern: "Max Mustermann",
          action: "block",
          scope: "session",
          label: "Boss name",
        });

        assert.equal(rule.scope, "session");
        assert.equal(rule.label, "Boss name");
      });
    });

    describe("listRules", () => {
      it("returns all rules", () => {
        createRule(dbPath, { category: "email", pattern: "a@b.com", action: "anonymize" });
        createRule(dbPath, { category: "name", pattern: "Alice", action: "block", scope: "session" });

        const rules = listRules(dbPath);
        assert.equal(rules.length, 2);
      });

      it("filters by scope", () => {
        createRule(dbPath, { category: "email", pattern: "a@b.com", action: "anonymize" });
        createRule(dbPath, { category: "name", pattern: "Alice", action: "block", scope: "session" });

        const globalRules = listRules(dbPath, "global");
        assert.equal(globalRules.length, 1);
        assert.equal(globalRules[0].category, "email");

        const sessionRules = listRules(dbPath, "session");
        assert.equal(sessionRules.length, 1);
        assert.equal(sessionRules[0].category, "name");
      });

      it("returns empty array when no rules exist", () => {
        const rules = listRules(dbPath);
        assert.equal(rules.length, 0);
      });
    });

    describe("getRule", () => {
      it("finds a rule by id", () => {
        const created = createRule(dbPath, {
          category: "secret",
          pattern: "sk-.*",
          action: "block",
        });

        const found = getRule(dbPath, created.id);
        assert.ok(found);
        assert.equal(found.id, created.id);
        assert.equal(found.category, "secret");
        assert.equal(found.pattern, "sk-.*");
        assert.equal(found.action, "block");
      });

      it("returns undefined for unknown id", () => {
        const found = getRule(dbPath, "nonexistent");
        assert.equal(found, undefined);
      });
    });

    describe("deleteRule", () => {
      it("returns true for existing rule", () => {
        const rule = createRule(dbPath, {
          category: "path",
          pattern: "/Users/secret",
          action: "anonymize",
        });

        const deleted = deleteRule(dbPath, rule.id);
        assert.equal(deleted, true);

        // Verify it's gone
        const found = getRule(dbPath, rule.id);
        assert.equal(found, undefined);
      });

      it("returns false for unknown id", () => {
        const deleted = deleteRule(dbPath, "nonexistent");
        assert.equal(deleted, false);
      });
    });

    describe("findRulesByCategory", () => {
      it("returns matching rules", () => {
        createRule(dbPath, { category: "email", pattern: "a@b.com", action: "anonymize" });
        createRule(dbPath, { category: "email", pattern: "c@d.com", action: "block" });
        createRule(dbPath, { category: "name", pattern: "Alice", action: "allow" });

        const emailRules = findRulesByCategory(dbPath, "email");
        assert.equal(emailRules.length, 2);
        assert.ok(emailRules.every((r) => r.category === "email"));
      });

      it("returns empty array for unmatched category", () => {
        createRule(dbPath, { category: "email", pattern: "a@b.com", action: "anonymize" });

        const rules = findRulesByCategory(dbPath, "secret");
        assert.equal(rules.length, 0);
      });
    });

    describe("exportRulesAsMd", () => {
      it("returns empty-state message when no rules", () => {
        const md = exportRulesAsMd(dbPath);
        assert.ok(md.includes("Privacy Rules"));
        assert.ok(md.includes("Keine Regeln definiert"));
      });

      it("formats rules as markdown list", () => {
        createRule(dbPath, {
          category: "email",
          pattern: "boss@example.com",
          action: "anonymize",
          label: "Boss email",
        });
        createRule(dbPath, {
          category: "secret",
          pattern: "sk-.*",
          action: "block",
        });

        const md = exportRulesAsMd(dbPath);
        assert.ok(md.includes("# Privacy Rules"));
        assert.ok(md.includes("**Boss email**"));
        assert.ok(md.includes("(email)"));
        assert.ok(md.includes("→ anonymize"));
        assert.ok(md.includes("[global]"));
        // Rule without label should show pattern
        assert.ok(md.includes("**sk-.***"));
        assert.ok(md.includes("→ block"));
      });
    });
  },
);
