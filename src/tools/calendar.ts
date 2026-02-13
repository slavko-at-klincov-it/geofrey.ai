import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import { getGoogleConfig, getAuthUrl, exchangeCode, startOAuthCallbackServer } from "../integrations/google/auth.js";
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  listCalendars,
} from "../integrations/google/calendar.js";
import { t } from "../i18n/index.js";

const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"];

registerTool({
  name: "calendar",
  description: "Google Calendar: authenticate, list/get/create/update/delete events, list calendars.",
  parameters: z.object({
    action: z.enum(["auth", "list", "get", "create", "update", "delete", "calendars"]),
    calendarId: z.string().optional().describe("Calendar ID (default: primary)"),
    eventId: z.string().optional().describe("Event ID (for get/update/delete)"),
    summary: z.string().optional().describe("Event title (for create/update)"),
    start: z.string().optional().describe("Start time ISO 8601 (for create/update)"),
    end: z.string().optional().describe("End time ISO 8601 (for create/update)"),
    description: z.string().optional().describe("Event description"),
    location: z.string().optional().describe("Event location"),
    timeMin: z.string().optional().describe("Minimum time filter ISO 8601 (for list)"),
    timeMax: z.string().optional().describe("Maximum time filter ISO 8601 (for list)"),
  }),
  source: "native",
  execute: async ({ action, calendarId, eventId, summary, start, end, description, location, timeMin, timeMax }) => {
    if (action !== "auth" && !getGoogleConfig()) {
      return t("calendar.notConfigured");
    }

    switch (action) {
      case "auth": {
        if (!getGoogleConfig()) return t("calendar.notConfigured");
        const authUrl = getAuthUrl(CALENDAR_SCOPES);
        startOAuthCallbackServer().then(async (code) => {
          try {
            await exchangeCode(code);
            console.log("Calendar: OAuth2 tokens saved");
          } catch (err) {
            console.error("Calendar: Token exchange failed:", err);
          }
        }).catch(() => { /* timeout or error */ });
        return t("calendar.authUrl", { url: authUrl });
      }

      case "list": {
        try {
          const events = await listEvents(calendarId, timeMin, timeMax);
          if (events.length === 0) return t("calendar.listEmpty");
          const header = t("calendar.listHeader", { count: String(events.length) });
          const lines = events.map(
            (e) => `- [${e.id}] ${e.summary} | ${e.start} → ${e.end}${e.location ? ` @ ${e.location}` : ""}`,
          );
          return `${header}\n${lines.join("\n")}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Calendar error: ${msg}`;
        }
      }

      case "get": {
        if (!eventId) return t("tools.paramRequired", { param: "eventId", action: "get" });
        try {
          const event = await getEvent(calendarId ?? "primary", eventId);
          return [
            `Event: ${event.summary}`,
            `ID: ${event.id}`,
            `Start: ${event.start}`,
            `End: ${event.end}`,
            event.location ? `Location: ${event.location}` : null,
            event.description ? `Description: ${event.description}` : null,
            `Status: ${event.status}`,
            event.htmlLink ? `Link: ${event.htmlLink}` : null,
          ].filter(Boolean).join("\n");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Calendar error: ${msg}`;
        }
      }

      case "create": {
        if (!summary) return t("tools.paramRequired", { param: "summary", action: "create" });
        if (!start) return t("tools.paramRequired", { param: "start", action: "create" });
        if (!end) return t("tools.paramRequired", { param: "end", action: "create" });
        try {
          const event = await createEvent(calendarId ?? "primary", {
            summary,
            start,
            end,
            description,
            location,
          });
          return t("calendar.created", { id: event.id, summary: event.summary });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Calendar create error: ${msg}`;
        }
      }

      case "update": {
        if (!eventId) return t("tools.paramRequired", { param: "eventId", action: "update" });
        try {
          const event = await updateEvent(calendarId ?? "primary", eventId, {
            summary,
            start,
            end,
            description,
            location,
          });
          return t("calendar.updated", { id: event.id });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Calendar update error: ${msg}`;
        }
      }

      case "delete": {
        if (!eventId) return t("tools.paramRequired", { param: "eventId", action: "delete" });
        try {
          await deleteEvent(calendarId ?? "primary", eventId);
          return t("calendar.deleted", { id: eventId });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Calendar delete error: ${msg}`;
        }
      }

      case "calendars": {
        try {
          const calendars = await listCalendars();
          if (calendars.length === 0) return t("calendar.listEmpty");
          const lines = calendars.map(
            (c) => `- ${c.summary} (${c.id})${c.primary ? " [primary]" : ""}`,
          );
          return lines.join("\n");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Calendar error: ${msg}`;
        }
      }

      default:
        return t("tools.unknownAction", { action: String(action) });
    }
  },
});
