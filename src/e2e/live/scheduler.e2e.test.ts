import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../db/client.js";
import {
  initScheduler,
  stopScheduler,
  createJob,
  listJobs,
  _testTick,
  type JobExecutor,
} from "../../automation/scheduler.js";
import { parseCron, getNextRun } from "../../automation/cron-parser.js";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";

describe("E2E: Scheduler + Cron Parser (real SQLite)", { timeout: 30_000 }, () => {
  let env: TestEnv;

  before(async () => {
    env = await createTestEnv();
    getDb(env.dbUrl);
  });

  after(async () => {
    await stopScheduler();
    await env.cleanup();
  });

  it("scheduleJob persists to DB and getScheduledJobs returns it", async () => {
    const noopExecutor: JobExecutor = async () => {};
    initScheduler(noopExecutor, env.dbUrl);

    const job = createJob({
      type: "every",
      chatId: "chat-persist-test",
      task: "Prüfe den Server-Status",
      schedule: "300000", // 5 minutes in ms
    });

    assert.ok(job.id, "Job should have an ID");
    assert.equal(job.type, "every");
    assert.equal(job.chatId, "chat-persist-test");
    assert.equal(job.task, "Prüfe den Server-Status");
    assert.equal(job.enabled, true);

    const jobs = listJobs();
    const found = jobs.find((j) => j.id === job.id);
    assert.ok(found, "Created job should appear in listJobs()");
    assert.equal(found.task, "Prüfe den Server-Status");

    await stopScheduler();
  });

  it("cron expression parsing validates real expressions", () => {
    const parsed = parseCron("*/5 * * * *");
    assert.ok(parsed.minute.values.length > 0, "Should have minute values");
    // */5 should produce [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
    assert.equal(parsed.minute.values.length, 12, "*/5 should produce 12 minute values");
    assert.deepEqual(
      parsed.minute.values,
      [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
    );
    // Hour, dom, month, dow should be full ranges (wildcards)
    assert.equal(parsed.hour.values.length, 24);
    assert.equal(parsed.dom.values.length, 31);
    assert.equal(parsed.month.values.length, 12);
    assert.equal(parsed.dow.values.length, 7);

    // Invalid expression (wrong number of fields) should throw
    assert.throws(
      () => parseCron("* * *"),
      /Expected 5 fields/,
    );

    // Invalid field value should throw
    assert.throws(
      () => parseCron("99 * * * *"),
      /Invalid value/,
    );
  });

  it("getNextRun returns future date", () => {
    const now = new Date();
    const nextRun = getNextRun("*/5 * * * *");

    assert.ok(nextRun instanceof Date, "Should return a Date");
    assert.ok(
      nextRun.getTime() > now.getTime(),
      `Next run ${nextRun.toISOString()} should be after now ${now.toISOString()}`,
    );

    // Should be within the next 5 minutes (300_000ms) + 1 minute buffer
    const maxExpected = now.getTime() + 6 * 60 * 1000;
    assert.ok(
      nextRun.getTime() <= maxExpected,
      `Next run should be within ~6 minutes, got ${nextRun.toISOString()}`,
    );
  });

  it("scheduler tick executes due jobs", async () => {
    let executedTask = "";
    let executedChatId = "";
    const executed = new Promise<void>((resolve) => {
      const tickExecutor: JobExecutor = async (chatId, task) => {
        executedChatId = chatId;
        executedTask = task;
        resolve();
      };
      initScheduler(tickExecutor, env.dbUrl);
    });

    // Schedule a job with a 1ms interval so it's immediately due
    createJob({
      type: "every",
      chatId: "chat-tick-test",
      task: "Führe den Backup-Job aus",
      schedule: "1", // 1ms — will be due immediately
    });

    // Wait a moment for the nextRunAt to be in the past, then force a tick
    await new Promise((r) => setTimeout(r, 50));
    await _testTick();

    // Wait for the executor to be called (with timeout)
    await Promise.race([
      executed,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Executor was not called within 5s")), 5_000),
      ),
    ]);

    assert.equal(executedChatId, "chat-tick-test");
    assert.equal(executedTask, "Führe den Backup-Job aus");

    await stopScheduler();
  });

  it("stopScheduler prevents further execution", async () => {
    let callCount = 0;
    const countExecutor: JobExecutor = async () => {
      callCount++;
    };
    initScheduler(countExecutor, env.dbUrl);

    createJob({
      type: "every",
      chatId: "chat-stop-test",
      task: "Zähle die Aufrufe",
      schedule: "1", // 1ms interval
    });

    // Force one tick to prove it works
    await new Promise((r) => setTimeout(r, 50));
    await _testTick();
    // Give executor time to complete
    await new Promise((r) => setTimeout(r, 100));

    const countAfterFirstTick = callCount;
    assert.ok(countAfterFirstTick > 0, "Executor should have been called at least once");

    // Stop the scheduler
    await stopScheduler();

    // Record count after stop
    const countAfterStop = callCount;

    // Wait and verify no more executions happen
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(
      callCount,
      countAfterStop,
      "No more executions should happen after stopScheduler()",
    );
  });
});
