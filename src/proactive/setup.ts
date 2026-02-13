import { createJob, deleteJob, listJobs } from "../automation/scheduler.js";
import { loadProfile } from "../profile/store.js";
import { JOB_TAG_PREFIX } from "./handler.js";

export async function setupProactiveJobs(ownerChatId: string): Promise<void> {
  const profile = await loadProfile();
  if (!profile) return;

  // 1. Delete old proactive jobs (idempotent)
  const existing = listJobs(ownerChatId);
  for (const job of existing) {
    if (job.task.startsWith(JOB_TAG_PREFIX)) {
      deleteJob(job.id);
    }
  }

  // 2. Morning Brief
  if (profile.morningBrief.enabled) {
    const [hour, minute] = profile.morningBrief.time.split(":").map(Number);
    createJob({
      type: "cron",
      chatId: ownerChatId,
      task: `${JOB_TAG_PREFIX}morning_brief`,
      schedule: `${minute} ${hour} * * *`,
    });
  }

  // 3. Calendar Watch
  if (profile.calendarWatch.enabled) {
    createJob({
      type: "every",
      chatId: ownerChatId,
      task: `${JOB_TAG_PREFIX}calendar_watch`,
      schedule: String(profile.calendarWatch.intervalMinutes * 60_000),
    });
  }

  // 4. Email Monitor
  if (profile.emailMonitor.enabled) {
    createJob({
      type: "every",
      chatId: ownerChatId,
      task: `${JOB_TAG_PREFIX}email_monitor`,
      schedule: String(profile.emailMonitor.intervalMinutes * 60_000),
    });
  }
}
