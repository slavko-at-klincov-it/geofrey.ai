/**
 * Scheduler: manages "at", "every", and "cron" jobs with DB persistence,
 * retry with exponential backoff, and graceful shutdown.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { cronJobs } from "../db/schema.js";
import { getNextRun } from "./cron-parser.js";
import { t } from "../i18n/index.js";

export interface ScheduledJob {
  id: string;
  type: "at" | "every" | "cron";
  chatId: string;
  task: string;
  schedule: string;
  nextRunAt: Date;
  retryCount: number;
  maxRetries: number;
  enabled: boolean;
  createdAt: Date;
}

export type JobExecutor = (chatId: string, task: string) => Promise<void>;

const TICK_INTERVAL_MS = 30_000;
const RETRY_DELAYS_MS = [30_000, 60_000, 300_000, 900_000, 3_600_000]; // 30s, 1m, 5m, 15m, 60m

let tickTimer: ReturnType<typeof setInterval> | null = null;
let executor: JobExecutor | null = null;
let dbUrl: string | null = null;
let runningJobs = new Set<string>();
let shuttingDown = false;

function generateId(): string {
  return randomBytes(6).toString("hex");
}

function getRetryDelay(retryCount: number): number {
  const index = Math.min(retryCount, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
}

function computeNextRun(job: Pick<ScheduledJob, "type" | "schedule">): Date {
  switch (job.type) {
    case "at":
      return new Date(job.schedule);
    case "every":
      return new Date(Date.now() + parseInt(job.schedule, 10));
    case "cron":
      return getNextRun(job.schedule);
  }
}

function rowToJob(row: typeof cronJobs.$inferSelect): ScheduledJob {
  return {
    id: row.id,
    type: row.type,
    chatId: row.chatId,
    task: row.task,
    schedule: row.schedule,
    nextRunAt: row.nextRunAt,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    enabled: row.enabled,
    createdAt: row.createdAt,
  };
}

async function executeJob(job: ScheduledJob): Promise<void> {
  if (shuttingDown || !executor || !dbUrl) return;
  if (runningJobs.has(job.id)) return; // already running

  runningJobs.add(job.id);
  const db = getDb(dbUrl);

  try {
    await executor(job.chatId, job.task);

    // Success — reset retry count
    if (job.type === "at") {
      // One-shot: disable after execution
      db.update(cronJobs)
        .set({ enabled: false, retryCount: 0 })
        .where(eq(cronJobs.id, job.id))
        .run();
    } else {
      // Recurring: compute next run
      const nextRunAt = computeNextRun(job);
      db.update(cronJobs)
        .set({ nextRunAt, retryCount: 0 })
        .where(eq(cronJobs.id, job.id))
        .run();
    }
  } catch (err) {
    const newRetryCount = job.retryCount + 1;
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (newRetryCount >= job.maxRetries) {
      // Disable job after max retries
      db.update(cronJobs)
        .set({ enabled: false, retryCount: newRetryCount })
        .where(eq(cronJobs.id, job.id))
        .run();

      console.error(t("cron.jobDisabled", { id: job.id, max: String(job.maxRetries) }));

      // Notify user via executor (best-effort)
      if (executor) {
        try {
          await executor(
            job.chatId,
            t("cron.jobDisabled", { id: job.id, max: String(job.maxRetries) }),
          );
        } catch {
          // Notification failure is non-critical
        }
      }
    } else {
      // Schedule retry with exponential backoff
      const retryDelay = getRetryDelay(newRetryCount);
      const nextRunAt = new Date(Date.now() + retryDelay);

      db.update(cronJobs)
        .set({ nextRunAt, retryCount: newRetryCount })
        .where(eq(cronJobs.id, job.id))
        .run();

      console.warn(
        t("cron.jobFailed", {
          id: job.id,
          attempt: String(newRetryCount),
          max: String(job.maxRetries),
          error: errorMsg,
        }),
      );
    }
  } finally {
    runningJobs.delete(job.id);
  }
}

async function tick(): Promise<void> {
  if (shuttingDown || !dbUrl) return;

  const db = getDb(dbUrl);
  const now = new Date();

  const dueJobs = db
    .select()
    .from(cronJobs)
    .where(eq(cronJobs.enabled, true))
    .all()
    .filter((row) => row.nextRunAt.getTime() <= now.getTime())
    .map(rowToJob);

  // Execute due jobs concurrently (but don't await in the tick to avoid blocking)
  for (const job of dueJobs) {
    void executeJob(job);
  }
}

export function initScheduler(jobExecutor: JobExecutor, databaseUrl: string): void {
  if (tickTimer) {
    throw new Error("Scheduler already initialized");
  }

  executor = jobExecutor;
  dbUrl = databaseUrl;
  shuttingDown = false;

  const db = getDb(databaseUrl);
  const enabledJobs = db
    .select()
    .from(cronJobs)
    .where(eq(cronJobs.enabled, true))
    .all();

  console.log(t("cron.schedulerStarted", { count: String(enabledJobs.length) }));

  // Start the tick loop
  tickTimer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);

  // Unref so the timer doesn't keep the process alive during shutdown
  if (tickTimer && typeof tickTimer === "object" && "unref" in tickTimer) {
    tickTimer.unref();
  }
}

export interface CreateJobParams {
  type: "at" | "every" | "cron";
  chatId: string;
  task: string;
  schedule: string;
  maxRetries?: number;
}

export function createJob(params: CreateJobParams): ScheduledJob {
  if (!dbUrl) throw new Error("Scheduler not initialized");

  const db = getDb(dbUrl);
  const id = generateId();
  const now = new Date();

  let nextRunAt: Date;
  switch (params.type) {
    case "at":
      nextRunAt = new Date(params.schedule);
      if (isNaN(nextRunAt.getTime())) throw new Error(`Invalid ISO date: ${params.schedule}`);
      break;
    case "every": {
      const interval = parseInt(params.schedule, 10);
      if (isNaN(interval) || interval <= 0) throw new Error(`Invalid interval: ${params.schedule}`);
      nextRunAt = new Date(now.getTime() + interval);
      break;
    }
    case "cron":
      nextRunAt = getNextRun(params.schedule);
      break;
  }

  const job: ScheduledJob = {
    id,
    type: params.type,
    chatId: params.chatId,
    task: params.task,
    schedule: params.schedule,
    nextRunAt,
    retryCount: 0,
    maxRetries: params.maxRetries ?? 5,
    enabled: true,
    createdAt: now,
  };

  db.insert(cronJobs)
    .values({
      id: job.id,
      type: job.type,
      chatId: job.chatId,
      task: job.task,
      schedule: job.schedule,
      nextRunAt: job.nextRunAt,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      enabled: job.enabled,
      createdAt: job.createdAt,
    })
    .run();

  return job;
}

export function deleteJob(id: string): boolean {
  if (!dbUrl) throw new Error("Scheduler not initialized");

  const db = getDb(dbUrl);
  const result = db.delete(cronJobs).where(eq(cronJobs.id, id)).run();
  return result.changes > 0;
}

export function listJobs(chatId?: string): ScheduledJob[] {
  if (!dbUrl) throw new Error("Scheduler not initialized");

  const db = getDb(dbUrl);

  const rows = chatId
    ? db.select().from(cronJobs).where(eq(cronJobs.chatId, chatId)).all()
    : db.select().from(cronJobs).all();

  return rows.map(rowToJob);
}

export async function stopScheduler(): Promise<void> {
  shuttingDown = true;

  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }

  // Wait for running jobs to complete (max 30s)
  const timeout = Date.now() + 30_000;
  while (runningJobs.size > 0 && Date.now() < timeout) {
    await new Promise((r) => setTimeout(r, 200));
  }

  if (runningJobs.size > 0) {
    console.warn(`${runningJobs.size} jobs still running at scheduler shutdown`);
  }

  executor = null;
  dbUrl = null;
  runningJobs = new Set();
}

/** Exported for testing: force a tick immediately. */
export function _testTick(): Promise<void> {
  return tick();
}

/** Exported for testing: get the retry delay for a given count. */
export function _testGetRetryDelay(retryCount: number): number {
  return getRetryDelay(retryCount);
}
