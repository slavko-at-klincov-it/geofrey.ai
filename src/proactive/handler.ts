import { collectMorningBriefData, collectUpcomingEvents, collectNewEmails } from "./collector.js";
import { buildMorningBriefPrompt, buildCalendarReminderPrompt, buildEmailAlertPrompt } from "./templates.js";
import { wasAlreadyReminded, markReminded, cleanupReminders } from "./dedup.js";
import { getCachedProfile } from "../profile/store.js";

export const JOB_TAG_PREFIX = "__proactive_";

export type ProactiveJobType = "morning_brief" | "calendar_watch" | "email_monitor";

export function isProactiveTask(task: string): boolean {
  return task.startsWith(JOB_TAG_PREFIX);
}

export function parseJobType(task: string): ProactiveJobType | null {
  if (!isProactiveTask(task)) return null;
  const type = task.slice(JOB_TAG_PREFIX.length) as ProactiveJobType;
  if (["morning_brief", "calendar_watch", "email_monitor"].includes(type)) return type;
  return null;
}

export async function buildProactivePrompt(task: string): Promise<string | null> {
  const type = parseJobType(task);
  if (!type) return null;

  const profile = getCachedProfile();
  const userName = profile?.name ?? "User";

  switch (type) {
    case "morning_brief": {
      const data = await collectMorningBriefData();
      return buildMorningBriefPrompt(data, userName);
    }
    case "calendar_watch": {
      const minutes = profile?.calendarWatch.reminderMinutesBefore ?? 10;
      cleanupReminders();
      const events = await collectUpcomingEvents(minutes);
      // Filter already-reminded events
      const newEvents = events.filter((ev) => {
        if (wasAlreadyReminded(ev.id)) return false;
        markReminded(ev.id);
        return true;
      });
      return buildCalendarReminderPrompt(newEvents);
    }
    case "email_monitor": {
      const vip = profile?.emailMonitor.vipSenders ?? [];
      const kw = profile?.emailMonitor.keywords ?? [];
      const emails = await collectNewEmails(vip, kw);
      return buildEmailAlertPrompt(emails);
    }
  }
}
