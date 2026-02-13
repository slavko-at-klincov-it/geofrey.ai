import { getValidToken } from "./auth.js";

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const FETCH_TIMEOUT_MS = 15_000;

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  status: string;
  htmlLink?: string;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
}

async function calendarFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = await getValidToken();
  const res = await fetch(`${CALENDAR_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Calendar API returned ${res.status}: ${await res.text()}`);
  }
  return res;
}

/**
 * List events from a calendar.
 */
export async function listEvents(
  calendarId = "primary",
  timeMin?: string,
  timeMax?: string,
  maxResults = 10,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });
  if (timeMin) params.set("timeMin", timeMin);
  if (timeMax) params.set("timeMax", timeMax);

  const res = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
  );
  const data = await res.json() as {
    items?: Array<{
      id: string;
      summary?: string;
      description?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      status?: string;
      htmlLink?: string;
    }>;
  };

  return (data.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? "(no title)",
    description: e.description,
    location: e.location,
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    status: e.status ?? "confirmed",
    htmlLink: e.htmlLink,
  }));
}

/**
 * Get a single event.
 */
export async function getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
  const res = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  );
  const e = await res.json() as {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    status?: string;
    htmlLink?: string;
  };

  return {
    id: e.id,
    summary: e.summary ?? "(no title)",
    description: e.description,
    location: e.location,
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    status: e.status ?? "confirmed",
    htmlLink: e.htmlLink,
  };
}

export interface CreateEventInput {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
}

/**
 * Create a new event.
 */
export async function createEvent(
  calendarId: string,
  input: CreateEventInput,
): Promise<CalendarEvent> {
  const isAllDay = !input.start.includes("T");
  const body = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: isAllDay ? { date: input.start } : { dateTime: input.start },
    end: isAllDay ? { date: input.end } : { dateTime: input.end },
  };

  const res = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(body) },
  );
  const e = await res.json() as {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    status?: string;
    htmlLink?: string;
  };

  return {
    id: e.id,
    summary: e.summary ?? input.summary,
    description: e.description,
    location: e.location,
    start: e.start?.dateTime ?? e.start?.date ?? input.start,
    end: e.end?.dateTime ?? e.end?.date ?? input.end,
    status: e.status ?? "confirmed",
    htmlLink: e.htmlLink,
  };
}

/**
 * Update an existing event.
 */
export async function updateEvent(
  calendarId: string,
  eventId: string,
  updates: Partial<CreateEventInput>,
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {};
  if (updates.summary) body.summary = updates.summary;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.location !== undefined) body.location = updates.location;
  if (updates.start) {
    const isAllDay = !updates.start.includes("T");
    body.start = isAllDay ? { date: updates.start } : { dateTime: updates.start };
  }
  if (updates.end) {
    const isAllDay = !updates.end.includes("T");
    body.end = isAllDay ? { date: updates.end } : { dateTime: updates.end };
  }

  const res = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  const e = await res.json() as {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    status?: string;
    htmlLink?: string;
  };

  return {
    id: e.id,
    summary: e.summary ?? "(no title)",
    description: e.description,
    location: e.location,
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    status: e.status ?? "confirmed",
    htmlLink: e.htmlLink,
  };
}

/**
 * Delete an event.
 */
export async function deleteEvent(calendarId: string, eventId: string): Promise<boolean> {
  const token = await getValidToken();
  const res = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  return res.ok || res.status === 204;
}

/**
 * List available calendars.
 */
export async function listCalendars(): Promise<CalendarInfo[]> {
  const res = await calendarFetch("/users/me/calendarList");
  const data = await res.json() as {
    items?: Array<{ id: string; summary?: string; primary?: boolean }>;
  };

  return (data.items ?? []).map((c) => ({
    id: c.id,
    summary: c.summary ?? c.id,
    primary: c.primary ?? false,
  }));
}
