import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMorningBriefPrompt, buildCalendarReminderPrompt, buildEmailAlertPrompt } from "./templates.js";
import type { MorningBriefData } from "./collector.js";
import type { CalendarEvent } from "../integrations/google/calendar.js";
import type { GmailMessage } from "../integrations/google/gmail.js";

const fullData: MorningBriefData = {
  date: "2026-02-13",
  events: [
    {
      id: "ev1",
      summary: "Standup",
      start: "2026-02-13T09:00:00Z",
      end: "2026-02-13T09:30:00Z",
      status: "confirmed",
    },
    {
      id: "ev2",
      summary: "Lunch",
      start: "2026-02-13T12:00:00Z",
      end: "2026-02-13T13:00:00Z",
      status: "confirmed",
    },
  ],
  emails: [
    {
      id: "m1",
      threadId: "t1",
      subject: "Deploy Request",
      from: "boss@example.com",
      to: "me@example.com",
      date: "Thu, 13 Feb 2026 08:00:00 +0000",
      snippet: "Please deploy",
      labelIds: ["UNREAD"],
    },
  ],
  memoryHighlights: "Remember: deploy Friday",
};

const emptyData: MorningBriefData = {
  date: "2026-02-13",
  events: [],
  emails: [],
  memoryHighlights: "",
};

describe("proactive/templates", () => {
  describe("buildMorningBriefPrompt", () => {
    it("includes calendar section with events", () => {
      const result = buildMorningBriefPrompt(fullData, "Slavko");
      assert.ok(result.includes("Slavko"));
      assert.ok(result.includes("<today_calendar>"));
      assert.ok(result.includes("Standup"));
      assert.ok(result.includes("Lunch"));
      assert.ok(result.includes("</today_calendar>"));
    });

    it("includes email section with emails", () => {
      const result = buildMorningBriefPrompt(fullData, "Slavko");
      assert.ok(result.includes("<unread_emails>"));
      assert.ok(result.includes("boss@example.com"));
      assert.ok(result.includes("Deploy Request"));
      assert.ok(result.includes("</unread_emails>"));
    });

    it("includes memory section when highlights exist", () => {
      const result = buildMorningBriefPrompt(fullData, "Slavko");
      assert.ok(result.includes("<memory_context>"));
      assert.ok(result.includes("deploy Friday"));
      assert.ok(result.includes("</memory_context>"));
    });

    it("returns empty indicator when no events, emails, or memory", () => {
      const result = buildMorningBriefPrompt(emptyData, "Slavko");
      // Should not contain XML sections
      assert.ok(!result.includes("<today_calendar>"));
      assert.ok(!result.includes("<unread_emails>"));
      assert.ok(!result.includes("<memory_context>"));
    });

    it("truncates emails to 5 and shows count of remaining", () => {
      const manyEmails: GmailMessage[] = Array.from({ length: 8 }, (_, i) => ({
        id: `m${i}`,
        threadId: `t${i}`,
        subject: `Subject ${i}`,
        from: `sender${i}@example.com`,
        to: "me@example.com",
        date: "",
        snippet: "",
        labelIds: [],
      }));
      const data: MorningBriefData = {
        ...fullData,
        emails: manyEmails,
      };

      const result = buildMorningBriefPrompt(data, "User");
      assert.ok(result.includes("... +3 more"));
    });
  });

  describe("buildCalendarReminderPrompt", () => {
    it("returns null for empty events", () => {
      const result = buildCalendarReminderPrompt([]);
      assert.equal(result, null);
    });

    it("formats minutes correctly for upcoming event", () => {
      const futureTime = new Date(Date.now() + 10 * 60_000).toISOString();
      const events: CalendarEvent[] = [
        {
          id: "ev1",
          summary: "Meeting",
          start: futureTime,
          end: futureTime,
          status: "confirmed",
        },
      ];

      const result = buildCalendarReminderPrompt(events);
      assert.notEqual(result, null);
      assert.ok(result!.includes("Meeting"));
      assert.ok(result!.includes("10"));
    });

    it("includes all events in prompt", () => {
      const futureTime = new Date(Date.now() + 5 * 60_000).toISOString();
      const events: CalendarEvent[] = [
        { id: "ev1", summary: "Call A", start: futureTime, end: futureTime, status: "confirmed" },
        { id: "ev2", summary: "Call B", start: futureTime, end: futureTime, status: "confirmed" },
      ];

      const result = buildCalendarReminderPrompt(events);
      assert.ok(result!.includes("Call A"));
      assert.ok(result!.includes("Call B"));
    });
  });

  describe("buildEmailAlertPrompt", () => {
    it("returns null for empty emails", () => {
      const result = buildEmailAlertPrompt([]);
      assert.equal(result, null);
    });

    it("formats sender and subject", () => {
      const emails: GmailMessage[] = [
        {
          id: "m1",
          threadId: "t1",
          subject: "Urgent: Production Down",
          from: "ops@example.com",
          to: "me@example.com",
          date: "",
          snippet: "",
          labelIds: [],
        },
      ];

      const result = buildEmailAlertPrompt(emails);
      assert.notEqual(result, null);
      assert.ok(result!.includes("ops@example.com"));
      assert.ok(result!.includes("Urgent: Production Down"));
    });

    it("includes multiple emails", () => {
      const emails: GmailMessage[] = [
        { id: "m1", threadId: "t1", subject: "Sub 1", from: "a@b.com", to: "", date: "", snippet: "", labelIds: [] },
        { id: "m2", threadId: "t2", subject: "Sub 2", from: "c@d.com", to: "", date: "", snippet: "", labelIds: [] },
      ];

      const result = buildEmailAlertPrompt(emails);
      assert.ok(result!.includes("Sub 1"));
      assert.ok(result!.includes("Sub 2"));
    });
  });
});
