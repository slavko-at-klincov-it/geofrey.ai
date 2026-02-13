/**
 * Google Calendar API client — list events, create, update, delete.
 * Uses native fetch. Requires a valid access token from auth.ts.
 */

import { z } from "zod";

// ── Constants ───────────────────────────────────────────────────────────────

const CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_CALENDAR_ID = "primary";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CalendarDateTime {
  /** ISO 8601 date-time for timed events (e.g. "2026-03-15T10:00:00+01:00") */
  dateTime?: string;
  /** ISO 8601 date for all-day events (e.g. "2026-03-15") */
  date?: string;
  /** IANA timezone (e.g. "Europe/Berlin") */
  timeZone?: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: CalendarDateTime;
  end: CalendarDateTime;
  status: string;
  htmlLink: string;
  created: string;
  updated: string;
}

export interface CalendarEventInput {
  summary: string;
  start: CalendarDateTime;
  end: CalendarDateTime;
  description?: string;
  location?: string;
}

export interface CalendarEventUpdate {
  summary?: string;
  start?: CalendarDateTime;
  end?: CalendarDateTime;
  description?: string;
  location?: string;
}

export interface CalendarListResult {
  events: CalendarEvent[];
  nextPageToken?: string;
}

// ── Zod schemas for API responses ───────────────────────────────────────────

const dateTimeSchema = z.object({
  dateTime: z.string().optional(),
  date: z.string().optional(),
  timeZone: z.string().optional(),
});

const eventSchema = z.object({
  id: z.string(),
  summary: z.string().default("(no title)"),
  description: z.string().default(""),
  location: z.string().default(""),
  start: dateTimeSchema,
  end: dateTimeSchema,
  status: z.string().default("confirmed"),
  htmlLink: z.string().default(""),
  created: z.string().default(""),
  updated: z.string().default(""),
});

const eventListResponseSchema = z.object({
  items: z.array(eventSchema).default([]),
  nextPageToken: z.string().optional(),
});

const eventResponseSchema = eventSchema;

// ── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders(accessToken: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function calendarFetch(
  accessToken: string,
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  const url = `${CALENDAR_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...authHeaders(accessToken),
      ...(opts.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendar API ${res.status}: ${body}`);
  }

  return res;
}

function parseEvent(raw: z.infer<typeof eventSchema>): CalendarEvent {
  return {
    id: raw.id,
    summary: raw.summary,
    description: raw.description,
    location: raw.location,
    start: raw.start,
    end: raw.end,
    status: raw.status,
    htmlLink: raw.htmlLink,
    created: raw.created,
    updated: raw.updated,
  };
}

// ── API Functions ───────────────────────────────────────────────────────────

/**
 * List events in a calendar within a time range.
 * Default calendar is "primary". Times are ISO 8601 strings.
 */
export async function listEvents(
  accessToken: string,
  calendarId: string = DEFAULT_CALENDAR_ID,
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 25,
): Promise<CalendarListResult> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });

  if (timeMin) params.set("timeMin", timeMin);
  if (timeMax) params.set("timeMax", timeMax);

  const encodedCalId = encodeURIComponent(calendarId);
  const res = await calendarFetch(accessToken, `/calendars/${encodedCalId}/events?${params.toString()}`);
  const data = await res.json();
  const parsed = eventListResponseSchema.parse(data);

  return {
    events: parsed.items.map(parseEvent),
    nextPageToken: parsed.nextPageToken,
  };
}

/**
 * Create a new event in a calendar.
 * Supports both timed events (dateTime) and all-day events (date).
 */
export async function createEvent(
  accessToken: string,
  event: CalendarEventInput,
  calendarId: string = DEFAULT_CALENDAR_ID,
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {
    summary: event.summary,
    start: event.start,
    end: event.end,
  };
  if (event.description) body.description = event.description;
  if (event.location) body.location = event.location;

  const encodedCalId = encodeURIComponent(calendarId);
  const res = await calendarFetch(accessToken, `/calendars/${encodedCalId}/events`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return parseEvent(eventResponseSchema.parse(data));
}

/**
 * Update an existing event (partial update via PATCH).
 */
export async function updateEvent(
  accessToken: string,
  eventId: string,
  changes: CalendarEventUpdate,
  calendarId: string = DEFAULT_CALENDAR_ID,
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {};
  if (changes.summary !== undefined) body.summary = changes.summary;
  if (changes.start !== undefined) body.start = changes.start;
  if (changes.end !== undefined) body.end = changes.end;
  if (changes.description !== undefined) body.description = changes.description;
  if (changes.location !== undefined) body.location = changes.location;

  const encodedCalId = encodeURIComponent(calendarId);
  const encodedEventId = encodeURIComponent(eventId);
  const res = await calendarFetch(
    accessToken,
    `/calendars/${encodedCalId}/events/${encodedEventId}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );

  const data = await res.json();
  return parseEvent(eventResponseSchema.parse(data));
}

/**
 * Delete an event from a calendar.
 */
export async function deleteEvent(
  accessToken: string,
  eventId: string,
  calendarId: string = DEFAULT_CALENDAR_ID,
): Promise<void> {
  const encodedCalId = encodeURIComponent(calendarId);
  const encodedEventId = encodeURIComponent(eventId);
  await calendarFetch(
    accessToken,
    `/calendars/${encodedCalId}/events/${encodedEventId}`,
    { method: "DELETE" },
  );
}

// ── Formatting ──────────────────────────────────────────────────────────────

/**
 * Format an event's time display (handles both all-day and timed events).
 */
export function formatEventTime(dt: CalendarDateTime): string {
  if (dt.date) return dt.date;
  if (dt.dateTime) {
    const d = new Date(dt.dateTime);
    return d.toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: dt.timeZone,
    });
  }
  return "(unknown)";
}

/**
 * Format a CalendarEvent into a readable string for the orchestrator.
 */
export function formatEvent(event: CalendarEvent): string {
  const start = formatEventTime(event.start);
  const end = formatEventTime(event.end);
  const location = event.location ? ` | Location: ${event.location}` : "";
  const description = event.description ? `\n  ${event.description}` : "";
  return `[${event.id}] ${start} - ${end} | ${event.summary}${location}${description}`;
}
