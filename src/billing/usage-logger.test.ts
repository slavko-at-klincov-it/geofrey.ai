import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getDb, closeDb } from "../db/client.js";
import { logUsage, getDailyUsage, checkBudget } from "./usage-logger.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
  tmpDir = mkdtempSync(join(tmpdir(), "geofrey-billing-test-"));
  dbPath = join(tmpDir, "test.db");
}

function cleanup(): void {
  closeDb();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("usage-logger", { skip: !canLoadSqlite ? "better-sqlite3 native module not available" : undefined }, () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    cleanup();
  });

  describe("logUsage", () => {
    it("inserts a usage record into the database", () => {
      logUsage(dbPath, {
        model: "claude-sonnet-4-5-20250929",
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.0105,
        chatId: "user-42",
      });

      const usage = getDailyUsage(dbPath);
      assert.equal(usage.records, 1);
      assert.equal(usage.totalInputTokens, 1000);
      assert.equal(usage.totalOutputTokens, 500);
    });

    it("inserts multiple records", () => {
      logUsage(dbPath, {
        model: "claude-sonnet-4-5-20250929",
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.0105,
        chatId: "user-42",
      });

      logUsage(dbPath, {
        model: "claude-opus-4-6",
        inputTokens: 2000,
        outputTokens: 1000,
        costUsd: 0.105,
        chatId: "user-42",
      });

      const usage = getDailyUsage(dbPath);
      assert.equal(usage.records, 2);
      assert.equal(usage.totalInputTokens, 3000);
      assert.equal(usage.totalOutputTokens, 1500);
    });
  });

  describe("getDailyUsage", () => {
    it("sums costs correctly", () => {
      logUsage(dbPath, {
        model: "claude-sonnet-4-5-20250929",
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.0105,
        chatId: "user-42",
      });

      logUsage(dbPath, {
        model: "claude-opus-4-6",
        inputTokens: 2000,
        outputTokens: 1000,
        costUsd: 0.105,
        chatId: "user-42",
      });

      const usage = getDailyUsage(dbPath);
      // 0.0105 + 0.105 = 0.1155
      assert.ok(Math.abs(usage.totalCostUsd - 0.1155) < 0.0001);
    });

    it("returns zeros when no records exist", () => {
      const usage = getDailyUsage(dbPath);
      assert.equal(usage.totalCostUsd, 0);
      assert.equal(usage.totalInputTokens, 0);
      assert.equal(usage.totalOutputTokens, 0);
      assert.equal(usage.records, 0);
    });

    it("returns zeros for a date with no records", () => {
      logUsage(dbPath, {
        model: "claude-sonnet-4-5-20250929",
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.01,
        chatId: "user-42",
      });

      const usage = getDailyUsage(dbPath, "2020-01-01");
      assert.equal(usage.records, 0);
      assert.equal(usage.totalCostUsd, 0);
    });
  });

  describe("checkBudget", () => {
    it("returns correct spending and remaining budget", () => {
      logUsage(dbPath, {
        model: "claude-sonnet-4-5-20250929",
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.50,
        chatId: "user-42",
      });

      const budget = checkBudget(dbPath, 2.0);
      assert.ok(Math.abs(budget.spent - 0.50) < 0.0001);
      assert.ok(Math.abs(budget.remaining - 1.50) < 0.0001);
      assert.ok(Math.abs(budget.percentage - 25) < 0.1);
    });

    it("returns 0 remaining when over budget", () => {
      logUsage(dbPath, {
        model: "claude-opus-4-6",
        inputTokens: 10000,
        outputTokens: 5000,
        costUsd: 3.0,
        chatId: "user-42",
      });

      const budget = checkBudget(dbPath, 2.0);
      assert.equal(budget.remaining, 0);
      assert.ok(budget.percentage > 100);
    });

    it("returns zero percentage when budget is zero", () => {
      logUsage(dbPath, {
        model: "claude-sonnet-4-5-20250929",
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.50,
        chatId: "user-42",
      });

      // Edge case: zero budget should not divide by zero
      const budget = checkBudget(dbPath, 0);
      assert.equal(budget.percentage, 0);
    });
  });
});
