import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  formatEvent,
  formatEventTime,
  type CalendarEvent,
  type CalendarDateTime,
} from "./calendar.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

const TOKEN = "ya29.test-token";

function mockFetchJson(body: unknown, status: number = 200): typeof fetch {
  return mock.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

function mockFetchError(status: number, body: string): typeof fetch {
  return mock.fn(async () => ({
    ok: false,
    status,
    text: async () => body,
  })) as unknown as typeof fetch;
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    summary: "Test Meeting",
    description: "A test event",
    location: "Room 42",
    start: { dateTime: "2026-03-15T10:00:00+01:00" },
    end: { dateTime: "2026-03-15T11:00:00+01:00" },
    status: "confirmed",
    htmlLink: "https://calendar.google.com/event?eid=event-1",
    created: "2026-03-10T08:00:00Z",
    updated: "2026-03-10T08:00:00Z",
    ...overrides,
  };
}

// ── listEvents ──────────────────────────────────────────────────────────────

describe("listEvents", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; mock.restoreAll(); });

  it("lists events from the API", async () => {
    globalThis.fetch = mockFetchJson({
      items: [
        {
          id: "ev-1",
          summary: "Morning Meeting",
          description: "",
          location: "",
          start: { dateTime: "2026-03-15T09:00:00+01:00" },
          end: { dateTime: "2026-03-15T10:00:00+01:00" },
          status: "confirmed",
          htmlLink: "",
          created: "",
          updated: "",
        },
        {
          id: "ev-2",
          summary: "Lunch",
          description: "Team lunch",
          location: "Cafeteria",
          start: { dateTime: "2026-03-15T12:00:00+01:00" },
          end: { dateTime: "2026-03-15T13:00:00+01:00" },
          status: "confirmed",
          htmlLink: "",
          created: "",
          updated: "",
        },
      ],
    });

    const result = await listEvents(TOKEN, "primary");
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].summary, "Morning Meeting");
    assert.equal(result.events[1].summary, "Lunch");
    assert.equal(result.events[1].location, "Cafeteria");
  });

  it("passes time range parameters", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => ({ items: [] }),
      };
    }) as unknown as typeof fetch;

    await listEvents(TOKEN, "primary", "2026-03-15T00:00:00Z", "2026-03-16T00:00:00Z", 10);

    assert.ok(capturedUrl.includes("timeMin="));
    assert.ok(capturedUrl.includes("timeMax="));
    assert.ok(capturedUrl.includes("maxResults=10"));
    assert.ok(capturedUrl.includes("singleEvents=true"));
    assert.ok(capturedUrl.includes("orderBy=startTime"));
  });

  it("uses default calendar ID 'primary'", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return { ok: true, json: async () => ({ items: [] }) };
    }) as unknown as typeof fetch;

    await listEvents(TOKEN);
    assert.ok(capturedUrl.includes("/calendars/primary/events"));
  });

  it("URL-encodes calendar ID", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return { ok: true, json: async () => ({ items: [] }) };
    }) as unknown as typeof fetch;

    await listEvents(TOKEN, "user@example.com");
    assert.ok(capturedUrl.includes(encodeURIComponent("user@example.com")));
  });

  it("returns empty array when no events", async () => {
    globalThis.fetch = mockFetchJson({ items: [] });

    const result = await listEvents(TOKEN);
    assert.equal(result.events.length, 0);
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError(401, "Unauthorized");

    await assert.rejects(
      () => listEvents(TOKEN),
      (err: Error) => {
        assert.ok(err.message.includes("401"));
        return true;
      },
    );
  });

  it("includes nextPageToken when present", async () => {
    globalThis.fetch = mockFetchJson({
      items: [],
      nextPageToken: "page-2-token",
    });

    const result = await listEvents(TOKEN);
    assert.equal(result.nextPageToken, "page-2-token");
  });
});

// ── createEvent ─────────────────────────────────────────────────────────────

describe("createEvent", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; mock.restoreAll(); });

  it("creates a timed event", async () => {
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body as string;
      return {
        ok: true,
        json: async () => ({
          id: "new-event-1",
          summary: "Team Standup",
          description: "Daily standup meeting",
          location: "Zoom",
          start: { dateTime: "2026-03-15T10:00:00+01:00" },
          end: { dateTime: "2026-03-15T10:30:00+01:00" },
          status: "confirmed",
          htmlLink: "https://calendar.google.com/event?eid=new-event-1",
          created: "2026-03-14T08:00:00Z",
          updated: "2026-03-14T08:00:00Z",
        }),
      };
    }) as unknown as typeof fetch;

    const result = await createEvent(TOKEN, {
      summary: "Team Standup",
      start: { dateTime: "2026-03-15T10:00:00+01:00" },
      end: { dateTime: "2026-03-15T10:30:00+01:00" },
      description: "Daily standup meeting",
      location: "Zoom",
    });

    assert.equal(result.id, "new-event-1");
    assert.equal(result.summary, "Team Standup");
    assert.equal(result.location, "Zoom");

    const body = JSON.parse(capturedBody);
    assert.equal(body.summary, "Team Standup");
    assert.equal(body.description, "Daily standup meeting");
    assert.equal(body.location, "Zoom");
  });

  it("creates an all-day event", async () => {
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body as string;
      return {
        ok: true,
        json: async () => ({
          id: "allday-1",
          summary: "Holiday",
          description: "",
          location: "",
          start: { date: "2026-03-20" },
          end: { date: "2026-03-21" },
          status: "confirmed",
          htmlLink: "",
          created: "",
          updated: "",
        }),
      };
    }) as unknown as typeof fetch;

    const result = await createEvent(TOKEN, {
      summary: "Holiday",
      start: { date: "2026-03-20" },
      end: { date: "2026-03-21" },
    });

    assert.equal(result.id, "allday-1");
    assert.equal(result.start.date, "2026-03-20");

    const body = JSON.parse(capturedBody);
    assert.deepEqual(body.start, { date: "2026-03-20" });
  });

  it("omits optional fields when not provided", async () => {
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body as string;
      return {
        ok: true,
        json: async () => ({
          id: "ev-min",
          summary: "Min Event",
          description: "",
          location: "",
          start: { dateTime: "2026-03-15T10:00:00Z" },
          end: { dateTime: "2026-03-15T11:00:00Z" },
          status: "confirmed",
          htmlLink: "",
          created: "",
          updated: "",
        }),
      };
    }) as unknown as typeof fetch;

    await createEvent(TOKEN, {
      summary: "Min Event",
      start: { dateTime: "2026-03-15T10:00:00Z" },
      end: { dateTime: "2026-03-15T11:00:00Z" },
    });

    const body = JSON.parse(capturedBody);
    assert.ok(!("description" in body));
    assert.ok(!("location" in body));
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError(400, "Invalid event");

    await assert.rejects(
      () => createEvent(TOKEN, {
        summary: "Bad",
        start: { dateTime: "invalid" },
        end: { dateTime: "invalid" },
      }),
      (err: Error) => {
        assert.ok(err.message.includes("400"));
        return true;
      },
    );
  });
});

// ── updateEvent ─────────────────────────────────────────────────────────────

describe("updateEvent", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; mock.restoreAll(); });

  it("sends a PATCH request with changes", async () => {
    let capturedMethod = "";
    let capturedBody = "";
    let capturedUrl = "";

    globalThis.fetch = mock.fn(async (url: string | URL | Request, opts?: RequestInit) => {
      capturedUrl = String(url);
      capturedMethod = opts?.method ?? "GET";
      capturedBody = opts?.body as string;
      return {
        ok: true,
        json: async () => ({
          id: "event-1",
          summary: "Updated Title",
          description: "Updated desc",
          location: "New Room",
          start: { dateTime: "2026-03-15T10:00:00+01:00" },
          end: { dateTime: "2026-03-15T11:00:00+01:00" },
          status: "confirmed",
          htmlLink: "",
          created: "",
          updated: "",
        }),
      };
    }) as unknown as typeof fetch;

    const result = await updateEvent(TOKEN, "event-1", {
      summary: "Updated Title",
      description: "Updated desc",
      location: "New Room",
    });

    assert.equal(capturedMethod, "PATCH");
    assert.ok(capturedUrl.includes("/events/event-1"));
    assert.equal(result.summary, "Updated Title");

    const body = JSON.parse(capturedBody);
    assert.equal(body.summary, "Updated Title");
    assert.equal(body.description, "Updated desc");
    assert.equal(body.location, "New Room");
  });

  it("only includes provided changes", async () => {
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body as string;
      return {
        ok: true,
        json: async () => makeEvent({ summary: "Just Title" }),
      };
    }) as unknown as typeof fetch;

    await updateEvent(TOKEN, "event-1", { summary: "Just Title" });

    const body = JSON.parse(capturedBody);
    assert.ok("summary" in body);
    assert.ok(!("description" in body));
    assert.ok(!("location" in body));
    assert.ok(!("start" in body));
  });
});

// ── deleteEvent ─────────────────────────────────────────────────────────────

describe("deleteEvent", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; mock.restoreAll(); });

  it("sends DELETE request", async () => {
    let capturedMethod = "";
    let capturedUrl = "";

    globalThis.fetch = mock.fn(async (url: string | URL | Request, opts?: RequestInit) => {
      capturedUrl = String(url);
      capturedMethod = opts?.method ?? "GET";
      return { ok: true, json: async () => ({}), text: async () => "" };
    }) as unknown as typeof fetch;

    await deleteEvent(TOKEN, "event-del-1");

    assert.equal(capturedMethod, "DELETE");
    assert.ok(capturedUrl.includes("/events/event-del-1"));
    assert.ok(capturedUrl.includes("/calendars/primary/"));
  });

  it("uses custom calendar ID", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return { ok: true, json: async () => ({}), text: async () => "" };
    }) as unknown as typeof fetch;

    await deleteEvent(TOKEN, "event-1", "work@group.calendar.google.com");
    assert.ok(capturedUrl.includes(encodeURIComponent("work@group.calendar.google.com")));
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError(404, "Not Found");

    await assert.rejects(
      () => deleteEvent(TOKEN, "nonexistent"),
      (err: Error) => {
        assert.ok(err.message.includes("404"));
        return true;
      },
    );
  });
});

// ── formatEventTime ─────────────────────────────────────────────────────────

describe("formatEventTime", () => {
  it("returns date for all-day events", () => {
    const dt: CalendarDateTime = { date: "2026-03-15" };
    assert.equal(formatEventTime(dt), "2026-03-15");
  });

  it("formats dateTime for timed events", () => {
    const dt: CalendarDateTime = { dateTime: "2026-03-15T10:00:00+01:00" };
    const result = formatEventTime(dt);
    assert.ok(result.includes("2026"));
    assert.ok(result.length > 0);
  });

  it("returns (unknown) when neither date nor dateTime", () => {
    const dt: CalendarDateTime = {};
    assert.equal(formatEventTime(dt), "(unknown)");
  });
});

// ── formatEvent ─────────────────────────────────────────────────────────────

describe("formatEvent", () => {
  it("formats a timed event with location", () => {
    const event = makeEvent();
    const formatted = formatEvent(event);

    assert.ok(formatted.includes("[event-1]"));
    assert.ok(formatted.includes("Test Meeting"));
    assert.ok(formatted.includes("Room 42"));
    assert.ok(formatted.includes("A test event"));
  });

  it("formats an event without location", () => {
    const event = makeEvent({ location: "" });
    const formatted = formatEvent(event);

    assert.ok(!formatted.includes("Location:"));
  });

  it("formats an event without description", () => {
    const event = makeEvent({ description: "" });
    const formatted = formatEvent(event);

    assert.ok(formatted.includes("Test Meeting"));
    // No extra newline for empty description
    assert.ok(!formatted.includes("\n  \n"));
  });

  it("formats an all-day event", () => {
    const event = makeEvent({
      start: { date: "2026-03-20" },
      end: { date: "2026-03-21" },
    });
    const formatted = formatEvent(event);

    assert.ok(formatted.includes("2026-03-20"));
    assert.ok(formatted.includes("2026-03-21"));
  });
});
