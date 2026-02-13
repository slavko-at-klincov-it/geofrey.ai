import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { CalendarEvent } from "../integrations/google/calendar.js";
import type { GmailMessage } from "../integrations/google/gmail.js";

// mock.module requires --experimental-test-module-mocks flag (Node 22.3+)
const hasMockModule = typeof mock.module === "function";

const fakeEvents: CalendarEvent[] = [
  {
    id: "ev1",
    summary: "Standup",
    start: "2026-02-13T09:00:00Z",
    end: "2026-02-13T09:30:00Z",
    status: "confirmed",
  },
];

const fakeMessageStubs = [
  { id: "msg1", threadId: "t1" },
  { id: "msg2", threadId: "t2" },
];

const fakeFullMessage: GmailMessage = {
  id: "msg1",
  threadId: "t1",
  subject: "Important",
  from: "boss@example.com",
  to: "me@example.com",
  date: "Thu, 13 Feb 2026 08:00:00 +0000",
  snippet: "Please review",
  body: "Full body text",
  labelIds: ["UNREAD"],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

let listEventsMock: AnyFn = async () => fakeEvents;
let listMessagesMock: AnyFn = async () => fakeMessageStubs;
let getMessageMock: AnyFn = async () => fakeFullMessage;
let readMemoryMock: AnyFn = async () => "Remember: deploy Friday";

let listMessagesCallArgs: unknown[][] = [];

// Conditional module mocking — only when flag is enabled
if (hasMockModule) {
  mock.module("../integrations/google/calendar.js", {
    namedExports: {
      listEvents: (...args: unknown[]) => listEventsMock(...args),
    },
  });

  mock.module("../integrations/google/gmail.js", {
    namedExports: {
      listMessages: (...args: unknown[]) => {
        listMessagesCallArgs.push(args);
        return listMessagesMock(...args);
      },
      getMessage: (...args: unknown[]) => getMessageMock(...args),
    },
  });

  mock.module("../memory/store.js", {
    namedExports: {
      readMemory: (...args: unknown[]) => readMemoryMock(...args),
    },
  });
}

const collector = hasMockModule ? await import("./collector.js") : null;

describe("proactive/collector", { skip: !hasMockModule ? "requires --experimental-test-module-mocks" : undefined }, () => {
  beforeEach(() => {
    listEventsMock = async () => fakeEvents;
    listMessagesMock = async () => fakeMessageStubs;
    getMessageMock = async () => fakeFullMessage;
    readMemoryMock = async () => "Remember: deploy Friday";
    listMessagesCallArgs = [];
  });

  describe("collectMorningBriefData", () => {
    it("returns correct structure with date, events, emails, memory", async () => {
      const data = await collector!.collectMorningBriefData();

      assert.equal(typeof data.date, "string");
      assert.match(data.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(data.events.length, 1);
      assert.equal(data.events[0].summary, "Standup");
      assert.equal(data.emails.length, 2);
      assert.equal(data.memoryHighlights, "Remember: deploy Friday");
    });

    it("truncates memory to last 500 chars", async () => {
      const longMemory = "x".repeat(1000);
      readMemoryMock = async () => longMemory;

      const data = await collector!.collectMorningBriefData();
      assert.equal(data.memoryHighlights.length, 500);
    });

    it("returns empty events on calendar failure", async () => {
      listEventsMock = async () => {
        throw new Error("Calendar API down");
      };

      const data = await collector!.collectMorningBriefData();
      assert.deepEqual(data.events, []);
    });

    it("returns empty emails on gmail failure", async () => {
      listMessagesMock = async () => {
        throw new Error("Gmail API down");
      };

      const data = await collector!.collectMorningBriefData();
      assert.deepEqual(data.emails, []);
    });

    it("returns empty memory on store failure", async () => {
      readMemoryMock = async () => {
        throw new Error("Disk error");
      };

      const data = await collector!.collectMorningBriefData();
      assert.equal(data.memoryHighlights, "");
    });
  });

  describe("collectUpcomingEvents", () => {
    it("returns events within time window", async () => {
      const events = await collector!.collectUpcomingEvents(15);
      assert.equal(events.length, 1);
      assert.equal(events[0].summary, "Standup");
    });

    it("returns empty array on failure", async () => {
      listEventsMock = async () => {
        throw new Error("API error");
      };

      const events = await collector!.collectUpcomingEvents(15);
      assert.deepEqual(events, []);
    });
  });

  describe("collectNewEmails", () => {
    it("builds query with VIP senders and keywords", async () => {
      const emails = await collector!.collectNewEmails(
        ["boss@example.com"],
        ["urgent", "deploy"],
      );

      assert.equal(emails.length, 2);
      assert.equal(listMessagesCallArgs.length, 1);
      const query = listMessagesCallArgs[0][0] as string;
      assert.ok(query.includes("is:unread"));
      assert.ok(query.includes("from:(boss@example.com)"));
      assert.ok(query.includes("{urgent deploy}"));
    });

    it("builds query with only unread filter when no VIP or keywords", async () => {
      await collector!.collectNewEmails([], []);

      assert.equal(listMessagesCallArgs.length, 1);
      const query = listMessagesCallArgs[0][0] as string;
      assert.equal(query, "is:unread");
    });

    it("returns empty array on failure", async () => {
      listMessagesMock = async () => {
        throw new Error("Network error");
      };

      const emails = await collector!.collectNewEmails(["vip@test.com"], []);
      assert.deepEqual(emails, []);
    });
  });
});
