import type { MorningBriefData, TaskItem } from "./collector.js";
import type { CalendarEvent } from "../integrations/google/calendar.js";
import type { GmailMessage } from "../integrations/google/gmail.js";
import { t } from "../i18n/index.js";

export function buildMorningBriefPrompt(data: MorningBriefData, userName: string): string {
  const sections: string[] = [];

  sections.push(t("proactive.morning.title", { name: userName }));
  sections.push("");

  // Calendar
  if (data.events.length > 0) {
    sections.push(`### ${t("proactive.morning.calendar.section")}`);
    sections.push("<today_calendar>");
    for (const ev of data.events) {
      const time = ev.start
        ? new Date(ev.start).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
        : "?";
      let line = `- ${time}: ${ev.summary}`;
      if (ev.description) line += ` — ${ev.description.slice(0, 200)}`;
      if (ev.location) line += ` (${ev.location})`;
      sections.push(line);
    }
    sections.push("</today_calendar>");
  } else {
    sections.push(t("proactive.no.events"));
  }

  sections.push("");

  // Emails
  if (data.emails.length > 0) {
    sections.push(`### ${t("proactive.morning.email.section")}`);
    sections.push("<unread_emails>");
    for (const mail of data.emails.slice(0, 5)) {
      sections.push(`- ${mail.from}: ${mail.subject}`);
    }
    if (data.emails.length > 5) {
      sections.push(`  ... +${data.emails.length - 5} more`);
    }
    sections.push("</unread_emails>");
  } else {
    sections.push(t("proactive.no.emails"));
  }

  sections.push("");

  // Tasks
  if (data.tasks && data.tasks.length > 0) {
    sections.push(`### ${t("proactive.morning.tasks.section")}`);
    sections.push("<today_tasks>");
    for (const task of data.tasks.slice(0, 10)) {
      let line = `- ${task.title}`;
      if (task.due) {
        const dueTime = new Date(task.due).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        if (dueTime !== "00:00") line += ` (fällig: ${dueTime})`;
      }
      if (task.priority && task.priority > 2) line += " ⚡";
      sections.push(line);
    }
    if (data.tasks.length > 10) {
      sections.push(`  ... +${data.tasks.length - 10} more`);
    }
    sections.push("</today_tasks>");
  }

  sections.push("");

  // Memory
  if (data.memoryHighlights) {
    sections.push(`### ${t("proactive.morning.memory.section")}`);
    sections.push("<memory_context>");
    sections.push(data.memoryHighlights);
    sections.push("</memory_context>");
  }

  const content = sections.join("\n");

  // If there's nothing meaningful, return empty indicator
  if (data.events.length === 0 && data.emails.length === 0 && (!data.tasks || data.tasks.length === 0) && !data.memoryHighlights) {
    return t("proactive.morning.empty", { name: userName });
  }

  const prepHint = data.events.length > 0 ? `\n${t("proactive.calendar.prep.hint")}` : "";

  return `Bitte fasse diesen Morning Brief zusammen und schicke ihn dem User:${prepHint}\n\n${content}\n\n<task_hint>SIMPLE_TASK — handle this directly, do NOT use claude_code tool.</task_hint>`;
}

export function buildCalendarReminderPrompt(events: CalendarEvent[]): string | null {
  if (events.length === 0) return null;

  const lines: string[] = [];
  for (const ev of events) {
    const start = new Date(ev.start);
    const minutesUntil = Math.round((start.getTime() - Date.now()) / 60_000);
    let line = t("proactive.calendar.reminder", { minutes: String(minutesUntil), event: ev.summary });
    if (ev.description) line += `\n  Beschreibung: ${ev.description.slice(0, 300)}`;
    if (ev.location) line += `\n  Ort: ${ev.location}`;
    lines.push(line);
  }

  const prepHint = t("proactive.calendar.prep.hint");

  return `Bitte erinnere den User an folgende Termine und ${prepHint}:\n\n${lines.join("\n\n")}\n\n<task_hint>SIMPLE_TASK — handle this directly, do NOT use claude_code tool. Use memory_search to find relevant context about the meeting participants or topics.</task_hint>`;
}

export function buildEmailAlertPrompt(emails: GmailMessage[]): string | null {
  if (emails.length === 0) return null;
  const lines = emails.map((m) =>
    t("proactive.email.alert", { sender: m.from, subject: m.subject }),
  );
  return `Bitte informiere den User über folgende wichtige Mails:\n\n${lines.join("\n")}\n\n<task_hint>SIMPLE_TASK — handle this directly, do NOT use claude_code tool.</task_hint>`;
}
