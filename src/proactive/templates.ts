import type { MorningBriefData } from "./collector.js";
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
      sections.push(`- ${time}: ${ev.summary}`);
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

  // Memory
  if (data.memoryHighlights) {
    sections.push(`### ${t("proactive.morning.memory.section")}`);
    sections.push("<memory_context>");
    sections.push(data.memoryHighlights);
    sections.push("</memory_context>");
  }

  const content = sections.join("\n");

  // If there's nothing meaningful, return empty indicator
  if (data.events.length === 0 && data.emails.length === 0 && !data.memoryHighlights) {
    return t("proactive.morning.empty", { name: userName });
  }

  return `Bitte fasse diesen Morning Brief zusammen und schicke ihn dem User:\n\n${content}`;
}

export function buildCalendarReminderPrompt(events: CalendarEvent[]): string | null {
  if (events.length === 0) return null;
  const lines = events.map((ev) => {
    const start = new Date(ev.start);
    const minutesUntil = Math.round((start.getTime() - Date.now()) / 60_000);
    return t("proactive.calendar.reminder", { minutes: String(minutesUntil), event: ev.summary });
  });
  return `Bitte erinnere den User an folgende Termine:\n\n${lines.join("\n")}`;
}

export function buildEmailAlertPrompt(emails: GmailMessage[]): string | null {
  if (emails.length === 0) return null;
  const lines = emails.map((m) =>
    t("proactive.email.alert", { sender: m.from, subject: m.subject }),
  );
  return `Bitte informiere den User über folgende wichtige Mails:\n\n${lines.join("\n")}`;
}
