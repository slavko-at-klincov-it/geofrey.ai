import { createJob, deleteJob, listJobs } from "../automation/scheduler.js";
import { loadProfile } from "../profile/store.js";
import { JOB_TAG_PREFIX } from "./handler.js";

/**
 * Convert a local HH:MM time in the given timezone to UTC HH:MM.
 * The cron parser operates in UTC, so we must offset.
 */
function localTimeToUtc(time: string, timezone: string): { hour: number; minute: number } {
  const [localHour, localMinute] = time.split(":").map(Number);

  // Create a date in the user's timezone at the specified time
  // Use a reference date (2026-01-15) to get the UTC offset for that timezone
  const refDate = new Date(2026, 0, 15, localHour, localMinute, 0);
  const localStr = refDate.toLocaleString("en-US", { timeZone: timezone });
  const utcStr = refDate.toLocaleString("en-US", { timeZone: "UTC" });

  const localDate = new Date(localStr);
  const utcDate = new Date(utcStr);
  const offsetMs = localDate.getTime() - utcDate.getTime();

  // Apply offset: UTC = local - offset
  let utcMinutes = localHour * 60 + localMinute - Math.round(offsetMs / 60_000);
  // Normalize to 0-1439
  utcMinutes = ((utcMinutes % 1440) + 1440) % 1440;

  return {
    hour: Math.floor(utcMinutes / 60),
    minute: utcMinutes % 60,
  };
}

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

  // 2. Morning Brief (convert user's local time to UTC for cron)
  if (profile.morningBrief.enabled) {
    const { hour, minute } = localTimeToUtc(profile.morningBrief.time, profile.timezone);
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
