/**
 * Calendar tool — list, create, update, delete Google Calendar events.
 * Risk levels: auth=L1, list=L0, create/update=L1, delete=L2.
 */

import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import {
  type GoogleAuthConfig,
  getValidToken,
  startOAuthFlow,
  ALL_SCOPES,
} from "../integrations/google/auth.js";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  formatEvent,
  type CalendarDateTime,
} from "../integrations/google/calendar.js";

// ── Module State ────────────────────────────────────────────────────────────

let authConfig: GoogleAuthConfig | null = null;

/**
 * Initialize the Calendar tool with Google OAuth config.
 * Must be called before using any Calendar tool actions.
 */
export function initCalendarTool(config: GoogleAuthConfig): void {
  authConfig = config;
}

/**
 * Get the current auth config (for testing).
 */
export function getCalendarAuthConfig(): GoogleAuthConfig | null {
  return authConfig;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function requireToken(chatId: string): Promise<string> {
  if (!authConfig) {
    throw new Error("Calendar not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }
  const token = await getValidToken(authConfig, chatId);
  if (!token) {
    throw new Error("Not authenticated — use action 'auth' first to connect your Google account");
  }
  return token;
}

/**
 * Parse a date/time string into a CalendarDateTime.
 * Supports:
 *   - ISO date only: "2026-03-15" → all-day event
 *   - ISO datetime: "2026-03-15T10:00:00" → timed event
 *   - ISO datetime with timezone: "2026-03-15T10:00:00+01:00" → timed event
 */
export function parseDateTime(input: string): CalendarDateTime {
  // All-day event: date only (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return { date: input };
  }
  // Timed event: ISO 8601 datetime
  return { dateTime: input };
}

// ── Tool Registration ───────────────────────────────────────────────────────

const dateTimeZodSchema = z.object({
  dateTime: z.string().optional().describe("ISO 8601 date-time (e.g. '2026-03-15T10:00:00+01:00')"),
  date: z.string().optional().describe("ISO 8601 date for all-day events (e.g. '2026-03-15')"),
  timeZone: z.string().optional().describe("IANA timezone (e.g. 'Europe/Berlin')"),
}).optional();

registerTool({
  name: "calendar",
  description: "Google Calendar integration: authenticate, list, create, update, or delete events. Actions: auth (start OAuth, shares tokens with Gmail), list (upcoming events), create (new event), update (modify event), delete (remove event).",
  parameters: z.object({
    action: z.enum(["auth", "list", "create", "update", "delete"]),
    calendarId: z.string().optional().describe("Calendar ID (default: 'primary')"),
    timeMin: z.string().optional().describe("ISO 8601 start time filter for list"),
    timeMax: z.string().optional().describe("ISO 8601 end time filter for list"),
    maxResults: z.number().int().positive().max(100).optional().describe("Max results for list (default 25)"),
    title: z.string().optional().describe("Event title/summary (required for create)"),
    start: z.string().optional().describe("Event start: ISO date '2026-03-15' (all-day) or datetime '2026-03-15T10:00:00+01:00' (timed)"),
    end: z.string().optional().describe("Event end: ISO date or datetime"),
    description: z.string().optional().describe("Event description"),
    location: z.string().optional().describe("Event location"),
    eventId: z.string().optional().describe("Event ID (required for update/delete)"),
    changes: z.object({
      summary: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
    }).optional().describe("Changes to apply for update action"),
    chatId: z.string().optional().describe("Chat ID for OAuth context"),
  }),
  source: "native",
  execute: async ({ action, calendarId, timeMin, timeMax, maxResults, title, start, end, description, location, eventId, changes, chatId }) => {
    const effectiveChatId = chatId ?? "default";
    const effectiveCalendarId = calendarId ?? "primary";

    switch (action) {
      case "auth": {
        if (!authConfig) {
          return "Error: Calendar not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env";
        }

        // Check if already authenticated
        const existing = await getValidToken(authConfig, effectiveChatId);
        if (existing) {
          return "Already authenticated with Google. Use 'list' to view upcoming events.";
        }

        try {
          const { authUrl } = startOAuthFlow(authConfig, effectiveChatId, ALL_SCOPES);
          return `Open this URL to authorize Google Calendar access:\n\n${authUrl}\n\nThe authorization will complete automatically once you approve access.`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error starting OAuth flow: ${msg}`;
        }
      }

      case "list": {
        try {
          const token = await requireToken(effectiveChatId);
          const effectiveTimeMin = timeMin ?? new Date().toISOString();
          const limit = maxResults ?? 25;

          const result = await listEvents(
            token,
            effectiveCalendarId,
            effectiveTimeMin,
            timeMax,
            limit,
          );

          if (result.events.length === 0) {
            return "No upcoming events found";
          }

          const formatted = result.events.map(formatEvent).join("\n");
          return `${result.events.length} event(s):\n${formatted}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error listing events: ${msg}`;
        }
      }

      case "create": {
        if (!title) return "Error: 'title' is required for create";
        if (!start) return "Error: 'start' is required for create";
        if (!end) return "Error: 'end' is required for create";

        try {
          const token = await requireToken(effectiveChatId);
          const event = await createEvent(
            token,
            {
              summary: title,
              start: parseDateTime(start),
              end: parseDateTime(end),
              description,
              location,
            },
            effectiveCalendarId,
          );

          return `Event created: ${formatEvent(event)}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error creating event: ${msg}`;
        }
      }

      case "update": {
        if (!eventId) return "Error: 'eventId' is required for update";
        if (!changes) return "Error: 'changes' object is required for update";

        try {
          const token = await requireToken(effectiveChatId);
          const updateData: Record<string, unknown> = {};
          if (changes.summary !== undefined) updateData.summary = changes.summary;
          if (changes.start !== undefined) updateData.start = parseDateTime(changes.start);
          if (changes.end !== undefined) updateData.end = parseDateTime(changes.end);
          if (changes.description !== undefined) updateData.description = changes.description;
          if (changes.location !== undefined) updateData.location = changes.location;

          const event = await updateEvent(
            token,
            eventId,
            updateData,
            effectiveCalendarId,
          );

          return `Event updated: ${formatEvent(event)}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error updating event: ${msg}`;
        }
      }

      case "delete": {
        if (!eventId) return "Error: 'eventId' is required for delete";

        try {
          const token = await requireToken(effectiveChatId);
          await deleteEvent(token, eventId, effectiveCalendarId);
          return `Event deleted (ID: ${eventId})`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error deleting event: ${msg}`;
        }
      }
    }
  },
});
