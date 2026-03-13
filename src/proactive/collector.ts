import { listEvents as listGoogleEvents, type CalendarEvent } from "../integrations/google/calendar.js";
import { listLocalEvents } from "../integrations/apple-calendar.js";
import { listMessages, getMessage, type GmailMessage } from "../integrations/google/gmail.js";
import { sanitizeEmails, type SanitizedEmail } from "../privacy/email-preprocessor.js";
import { getAnonymizerConfig } from "../tools/claude-code.js";
import { readMemory } from "../memory/store.js";
import { getCachedProfile } from "../profile/store.js";

export interface MorningBriefData {
  date: string;
  events: CalendarEvent[];
  emails: GmailMessage[];
  memoryHighlights: string;
  tasks: TaskItem[];
}

export interface TaskItem {
  id: string;
  title: string;
  due?: string;
  priority?: number;
  source: string;   // "todoist" | "things3" | "apple-reminders"
}

async function anonymizeEmails(emails: GmailMessage[]): Promise<GmailMessage[]> {
  const anonConfig = getAnonymizerConfig();
  if (!anonConfig?.enabled || emails.length === 0) return emails;

  try {
    const sanitized = await sanitizeEmails(emails, anonConfig);
    // Map SanitizedEmail back to GmailMessage shape for downstream compatibility
    return sanitized.map((s): GmailMessage => ({
      id: s.id,
      threadId: s.threadId,
      subject: s.subject,
      from: s.from,
      to: s.to,
      date: s.date,
      snippet: s.snippet,
      body: s.body,
      labelIds: s.labelIds,
    }));
  } catch {
    // Anonymization failure is non-critical — return raw emails
    return emails;
  }
}

async function collectTasks(): Promise<TaskItem[]> {
  const profile = getCachedProfile();
  const provider = profile?.taskApp.provider ?? "none";

  try {
    switch (provider) {
      case "todoist": {
        const { listTodayTasks } = await import("../integrations/todoist.js");
        const tasks = await listTodayTasks();
        return tasks.map((t) => ({
          id: t.id,
          title: t.content,
          due: t.due?.datetime ?? t.due?.date,
          priority: t.priority,
          source: "todoist",
        }));
      }
      case "things3": {
        const { listTodayTasks } = await import("../integrations/things3.js");
        const tasks = await listTodayTasks();
        return tasks.map((t) => ({
          id: t.id,
          title: t.name,
          due: t.dueDate,
          source: "things3",
        }));
      }
      case "apple-reminders": {
        const { listTodayReminders } = await import("../integrations/apple-reminders.js");
        const reminders = await listTodayReminders();
        return reminders.map((r) => ({
          id: r.id,
          title: r.name,
          due: r.dueDate,
          priority: r.priority || undefined,
          source: "apple-reminders",
        }));
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}

async function listCalendarEvents(
  timeMin: string,
  timeMax: string,
  maxResults: number,
): Promise<CalendarEvent[]> {
  const profile = getCachedProfile();
  const provider = profile?.calendarApp.provider ?? "none";

  switch (provider) {
    case "apple":
      return listLocalEvents(timeMin, timeMax, maxResults).catch(() => []);
    case "google":
      return listGoogleEvents("primary", timeMin, timeMax, maxResults).catch(() => []);
    default:
      return [];
  }
}

export async function collectMorningBriefData(): Promise<MorningBriefData> {
  const today = new Date();
  const date = today.toISOString().split("T")[0]!;
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const [events, messageStubs, memory, tasks] = await Promise.all([
    listCalendarEvents(startOfDay, endOfDay, 20),
    listMessages("is:unread", 10).catch(() => [] as Array<{ id: string; threadId: string }>),
    readMemory().catch(() => ""),
    collectTasks(),
  ]);

  // Fetch full message details for each stub
  const rawEmails = await Promise.all(
    messageStubs.map((stub) =>
      getMessage(stub.id).catch(
        (): GmailMessage => ({
          id: stub.id,
          threadId: stub.threadId,
          subject: "",
          from: "",
          to: "",
          date: "",
          snippet: "",
          labelIds: [],
        }),
      ),
    ),
  );

  // Anonymize emails before passing to LLM
  const emails = await anonymizeEmails(rawEmails);

  // Extract last 500 chars of memory as highlights
  const memoryHighlights = memory.length > 500 ? memory.slice(-500) : memory;

  return { date, events, emails, memoryHighlights, tasks };
}

export async function collectUpcomingEvents(withinMinutes: number): Promise<CalendarEvent[]> {
  const now = new Date();
  const future = new Date(now.getTime() + withinMinutes * 60_000);
  return listCalendarEvents(now.toISOString(), future.toISOString(), 10);
}

export async function collectNewEmails(
  vipSenders: string[],
  keywords: string[],
): Promise<GmailMessage[]> {
  try {
    const parts: string[] = ["is:unread"];
    if (vipSenders.length > 0) {
      parts.push(`from:(${vipSenders.join(" OR ")})`);
    }
    if (keywords.length > 0) {
      parts.push(`{${keywords.join(" ")}}`);
    }
    const stubs = await listMessages(parts.join(" "), 10);
    // Fetch full body for each
    const full = await Promise.all(stubs.map((s) => getMessage(s.id).catch(
      (): GmailMessage => ({
        id: s.id,
        threadId: s.threadId,
        subject: "",
        from: "",
        to: "",
        date: "",
        snippet: "",
        labelIds: [],
      }),
    )));
    // Anonymize before passing to LLM
    return anonymizeEmails(full);
  } catch {
    return [];
  }
}
