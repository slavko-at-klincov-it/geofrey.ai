import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDb, closeDb } from "../db/client.js";
import {
  initScheduler,
  listJobs,
  stopScheduler,
} from "../automation/scheduler.js";
import {
  setProfileBaseDir,
} from "../profile/store.js";
import type { Profile } from "../profile/schema.js";
import { JOB_TAG_PREFIX } from "./handler.js";

let tmpDir: string;
let dbPath: string;
let canLoadSqlite = true;

// Pre-check if better-sqlite3 native module is available
try {
  const tempDir = mkdtempSync(join(tmpdir(), "geofrey-proactive-check-"));
  const tempDbPath = join(tempDir, "check.db");
  getDb(tempDbPath);
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
} catch {
  canLoadSqlite = false;
}

const fullProfile: Profile = {
  version: 1,
  name: "Slavko",
  timezone: "Europe/Berlin",
  communicationStyle: "mixed",
  interests: [],
  calendarApp: { provider: "none" },
  notesApp: { provider: "none" },
  taskApp: { provider: "none" },
  morningBrief: {
    enabled: true,
    time: "07:30",
    includeCalendar: true,
    includeEmail: true,
    includeMemory: true,
  },
  calendarWatch: {
    enabled: true,
    intervalMinutes: 15,
    reminderMinutesBefore: 10,
  },
  emailMonitor: {
    enabled: true,
    intervalMinutes: 5,
    vipSenders: ["boss@example.com"],
    keywords: ["urgent"],
  },
};

const disabledProfile: Profile = {
  ...fullProfile,
  morningBrief: { ...fullProfile.morningBrief, enabled: false },
  calendarWatch: { ...fullProfile.calendarWatch, enabled: false },
  emailMonitor: { ...fullProfile.emailMonitor, enabled: false },
};

function writeProfile(dir: string, profile: Profile): void {
  const geofreyDir = join(dir, ".geofrey");
  mkdirSync(geofreyDir, { recursive: true });
  writeFileSync(join(geofreyDir, "profile.json"), JSON.stringify(profile));
}

describe("proactive/setup", { skip: !canLoadSqlite ? "better-sqlite3 native module not available" : undefined }, () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "geofrey-proactive-test-"));
    dbPath = join(tmpDir, "test.db");
    getDb(dbPath);
    closeDb();
    initScheduler(async () => {}, dbPath);
  });

  afterEach(async () => {
    await stopScheduler();
    closeDb();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("creates 3 jobs when all proactive features are enabled", async () => {
    writeProfile(tmpDir, fullProfile);
    setProfileBaseDir(tmpDir);

    const { setupProactiveJobs } = await import("./setup.js");
    await setupProactiveJobs("chat1");

    const jobs = listJobs("chat1");
    const proactiveJobs = jobs.filter((j) => j.task.startsWith(JOB_TAG_PREFIX));
    assert.equal(proactiveJobs.length, 3);

    const tasks = proactiveJobs.map((j) => j.task).sort();
    assert.deepEqual(tasks, [
      `${JOB_TAG_PREFIX}calendar_watch`,
      `${JOB_TAG_PREFIX}email_monitor`,
      `${JOB_TAG_PREFIX}morning_brief`,
    ]);
  });

  it("creates morning brief with correct cron schedule", async () => {
    writeProfile(tmpDir, fullProfile);
    setProfileBaseDir(tmpDir);

    const { setupProactiveJobs } = await import("./setup.js");
    await setupProactiveJobs("chat1");

    const jobs = listJobs("chat1");
    const morning = jobs.find((j) => j.task === `${JOB_TAG_PREFIX}morning_brief`);
    assert.ok(morning);
    assert.equal(morning.type, "cron");
    assert.equal(morning.schedule, "30 7 * * *"); // 07:30
  });

  it("creates calendar watch with correct interval", async () => {
    writeProfile(tmpDir, fullProfile);
    setProfileBaseDir(tmpDir);

    const { setupProactiveJobs } = await import("./setup.js");
    await setupProactiveJobs("chat1");

    const jobs = listJobs("chat1");
    const calWatch = jobs.find((j) => j.task === `${JOB_TAG_PREFIX}calendar_watch`);
    assert.ok(calWatch);
    assert.equal(calWatch.type, "every");
    assert.equal(calWatch.schedule, String(15 * 60_000)); // 15 minutes
  });

  it("creates email monitor with correct interval", async () => {
    writeProfile(tmpDir, fullProfile);
    setProfileBaseDir(tmpDir);

    const { setupProactiveJobs } = await import("./setup.js");
    await setupProactiveJobs("chat1");

    const jobs = listJobs("chat1");
    const emailMon = jobs.find((j) => j.task === `${JOB_TAG_PREFIX}email_monitor`);
    assert.ok(emailMon);
    assert.equal(emailMon.type, "every");
    assert.equal(emailMon.schedule, String(5 * 60_000)); // 5 minutes
  });

  it("deletes old proactive jobs before creating new ones", async () => {
    writeProfile(tmpDir, fullProfile);
    setProfileBaseDir(tmpDir);

    const { setupProactiveJobs } = await import("./setup.js");

    // Run setup twice
    await setupProactiveJobs("chat1");
    // Reset cache to force reload
    setProfileBaseDir(tmpDir);
    await setupProactiveJobs("chat1");

    const jobs = listJobs("chat1");
    const proactiveJobs = jobs.filter((j) => j.task.startsWith(JOB_TAG_PREFIX));
    // Should still be exactly 3, not 6
    assert.equal(proactiveJobs.length, 3);
  });

  it("creates no jobs when all proactive features are disabled", async () => {
    writeProfile(tmpDir, disabledProfile);
    setProfileBaseDir(tmpDir);

    const { setupProactiveJobs } = await import("./setup.js");
    await setupProactiveJobs("chat1");

    const jobs = listJobs("chat1");
    const proactiveJobs = jobs.filter((j) => j.task.startsWith(JOB_TAG_PREFIX));
    assert.equal(proactiveJobs.length, 0);
  });

  it("does nothing when no profile exists", async () => {
    // Point to empty dir (no .geofrey/profile.json)
    setProfileBaseDir(tmpDir);

    const { setupProactiveJobs } = await import("./setup.js");
    await setupProactiveJobs("chat1");

    const jobs = listJobs("chat1");
    assert.equal(jobs.length, 0);
  });

  it("does not delete non-proactive jobs", async () => {
    // Create a regular job first
    const { createJob } = await import("../automation/scheduler.js");
    createJob({
      type: "every",
      chatId: "chat1",
      task: "regular_task",
      schedule: "60000",
    });

    writeProfile(tmpDir, fullProfile);
    setProfileBaseDir(tmpDir);

    const { setupProactiveJobs } = await import("./setup.js");
    await setupProactiveJobs("chat1");

    const jobs = listJobs("chat1");
    const regularJobs = jobs.filter((j) => !j.task.startsWith(JOB_TAG_PREFIX));
    assert.equal(regularJobs.length, 1);
    assert.equal(regularJobs[0].task, "regular_task");
  });
});
