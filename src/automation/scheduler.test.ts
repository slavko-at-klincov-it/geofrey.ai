import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  initScheduler,
  createJob,
  deleteJob,
  listJobs,
  stopScheduler,
  _testTick,
  _testGetRetryDelay,
} from "./scheduler.js";
import type { JobExecutor } from "./scheduler.js";
import { getDb, closeDb } from "../db/client.js";

let tmpDir: string;
let dbPath: string;
let executorCalls: Array<{ chatId: string; task: string }>;
let executorFn: JobExecutor;
let shouldFail: boolean;
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
  tmpDir = mkdtempSync(join(tmpdir(), "geofrey-test-"));
  dbPath = join(tmpDir, "test.db");
  // Initialize DB via project's getDb (handles migration)
  getDb(dbPath);
  closeDb(); // Close so scheduler can open it

  executorCalls = [];
  shouldFail = false;
  executorFn = async (chatId: string, task: string) => {
    executorCalls.push({ chatId, task });
    if (shouldFail) throw new Error("executor failure");
  };

  initScheduler(executorFn, dbPath);
}

function cleanup(): void {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("scheduler", { skip: !canLoadSqlite ? "better-sqlite3 native module not available" : undefined }, () => {
  beforeEach(() => setup());

  afterEach(async () => {
    await stopScheduler();
    closeDb();
    cleanup();
  });

  describe("createJob", () => {
    it("creates an 'at' job and persists to DB", () => {
      const futureDate = new Date(Date.now() + 60_000).toISOString();
      const job = createJob({
        type: "at",
        chatId: "chat1",
        task: "say hello",
        schedule: futureDate,
      });

      assert.equal(job.type, "at");
      assert.equal(job.chatId, "chat1");
      assert.equal(job.task, "say hello");
      assert.equal(job.enabled, true);
      assert.equal(job.retryCount, 0);
      assert.equal(job.maxRetries, 5);
      assert.equal(typeof job.id, "string");
      assert.ok(job.id.length > 0);
    });

    it("creates an 'every' job", () => {
      const job = createJob({
        type: "every",
        chatId: "chat1",
        task: "check status",
        schedule: "60000",
      });

      assert.equal(job.type, "every");
      assert.equal(job.schedule, "60000");
      // nextRunAt should be approximately now + 60s
      const diff = job.nextRunAt.getTime() - Date.now();
      assert.ok(diff > 55_000 && diff <= 65_000, `nextRunAt diff was ${diff}ms`);
    });

    it("creates a 'cron' job", () => {
      const job = createJob({
        type: "cron",
        chatId: "chat1",
        task: "daily report",
        schedule: "0 9 * * *",
      });

      assert.equal(job.type, "cron");
      assert.equal(job.schedule, "0 9 * * *");
      assert.ok(job.nextRunAt.getTime() > Date.now());
    });

    it("throws on invalid 'at' schedule", () => {
      assert.throws(() => {
        createJob({ type: "at", chatId: "c1", task: "t", schedule: "not-a-date" });
      }, /Invalid ISO date/);
    });

    it("throws on invalid 'every' interval", () => {
      assert.throws(() => {
        createJob({ type: "every", chatId: "c1", task: "t", schedule: "abc" });
      }, /Invalid interval/);
    });

    it("throws on zero interval", () => {
      assert.throws(() => {
        createJob({ type: "every", chatId: "c1", task: "t", schedule: "0" });
      }, /Invalid interval/);
    });
  });

  describe("listJobs", () => {
    it("returns empty list when no jobs", () => {
      const jobs = listJobs();
      assert.equal(jobs.length, 0);
    });

    it("returns all created jobs", () => {
      const futureDate = new Date(Date.now() + 60_000).toISOString();
      createJob({ type: "at", chatId: "c1", task: "t1", schedule: futureDate });
      createJob({ type: "every", chatId: "c2", task: "t2", schedule: "5000" });

      const jobs = listJobs();
      assert.equal(jobs.length, 2);
    });

    it("filters by chatId", () => {
      const futureDate = new Date(Date.now() + 60_000).toISOString();
      createJob({ type: "at", chatId: "c1", task: "t1", schedule: futureDate });
      createJob({ type: "at", chatId: "c2", task: "t2", schedule: futureDate });

      const c1Jobs = listJobs("c1");
      assert.equal(c1Jobs.length, 1);
      assert.equal(c1Jobs[0].chatId, "c1");
    });
  });

  describe("deleteJob", () => {
    it("removes an existing job and returns true", () => {
      const futureDate = new Date(Date.now() + 60_000).toISOString();
      const job = createJob({ type: "at", chatId: "c1", task: "t1", schedule: futureDate });

      const result = deleteJob(job.id);
      assert.equal(result, true);
      assert.equal(listJobs().length, 0);
    });

    it("returns false for non-existent job", () => {
      const result = deleteJob("nonexistent");
      assert.equal(result, false);
    });
  });

  describe("tick execution", () => {
    it("executes 'at' job when due and disables it", async () => {
      // Create a job with nextRunAt in the past
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const job = createJob({ type: "at", chatId: "c1", task: "hello", schedule: pastDate });

      await _testTick();
      await new Promise((r) => setTimeout(r, 200));

      assert.equal(executorCalls.length, 1);
      assert.equal(executorCalls[0].chatId, "c1");
      assert.equal(executorCalls[0].task, "hello");

      // Job should be disabled after execution
      const jobs = listJobs();
      const updated = jobs.find((j) => j.id === job.id);
      assert.ok(updated);
      assert.equal(updated.enabled, false);
    });

    it("does not execute jobs that are not yet due", async () => {
      const futureDate = new Date(Date.now() + 3_600_000).toISOString();
      createJob({ type: "at", chatId: "c1", task: "future", schedule: futureDate });

      await _testTick();
      await new Promise((r) => setTimeout(r, 100));

      assert.equal(executorCalls.length, 0);
    });
  });

  describe("retry backoff", () => {
    it("increments retry count on failure", async () => {
      shouldFail = true;
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const job = createJob({ type: "at", chatId: "c1", task: "fail", schedule: pastDate });

      await _testTick();
      await new Promise((r) => setTimeout(r, 200));

      const jobs = listJobs();
      const updated = jobs.find((j) => j.id === job.id);
      assert.ok(updated);
      assert.equal(updated.retryCount, 1);
      assert.equal(updated.enabled, true); // still enabled (below maxRetries)
    });

    it("has correct backoff delays", () => {
      assert.equal(_testGetRetryDelay(0), 30_000);
      assert.equal(_testGetRetryDelay(1), 60_000);
      assert.equal(_testGetRetryDelay(2), 300_000);
      assert.equal(_testGetRetryDelay(3), 900_000);
      assert.equal(_testGetRetryDelay(4), 3_600_000);
      // Capped at 60m
      assert.equal(_testGetRetryDelay(5), 3_600_000);
      assert.equal(_testGetRetryDelay(100), 3_600_000);
    });
  });

  describe("graceful shutdown", () => {
    it("stopScheduler clears state", async () => {
      const futureDate = new Date(Date.now() + 60_000).toISOString();
      createJob({ type: "at", chatId: "c1", task: "t", schedule: futureDate });

      await stopScheduler();

      // Re-init to verify it can start again
      initScheduler(executorFn, dbPath);

      // Jobs should persist in DB after restart
      const jobs = listJobs();
      assert.equal(jobs.length, 1);
    });
  });
});
