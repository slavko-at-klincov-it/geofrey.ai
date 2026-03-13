import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CalendarEvent } from "./google/calendar.js";

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 10_000;

/**
 * Query macOS Calendar.app via osascript (JXA).
 * No cloud, no OAuth — reads directly from the local calendar store.
 */
export async function listLocalEvents(
  timeMin?: string,
  timeMax?: string,
  maxResults = 20,
): Promise<CalendarEvent[]> {
  const startDate = timeMin ? `new Date("${timeMin}")` : "new Date()";
  const endDate = timeMax
    ? `new Date("${timeMax}")`
    : "new Date(Date.now() + 24*60*60*1000)";

  // JXA script that reads from Calendar.app
  const script = `
    var app = Application("Calendar");
    var start = ${startDate};
    var end = ${endDate};
    var results = [];
    var calendars = app.calendars();

    for (var c = 0; c < calendars.length; c++) {
      var cal = calendars[c];
      var events;
      try {
        events = cal.events.whose({
          _and: [
            { startDate: { _greaterThan: start } },
            { startDate: { _lessThan: end } }
          ]
        })();
      } catch(e) { continue; }

      for (var i = 0; i < events.length && results.length < ${maxResults}; i++) {
        var ev = events[i];
        try {
          results.push({
            id: ev.uid(),
            summary: ev.summary() || "(no title)",
            description: ev.description() || undefined,
            location: ev.location() || undefined,
            start: ev.startDate().toISOString(),
            end: ev.endDate().toISOString(),
            status: ev.status() || "confirmed",
            calendar: cal.name()
          });
        } catch(e) { /* skip unreadable events */ }
      }
    }

    // Sort by start time
    results.sort(function(a, b) {
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

    JSON.stringify(results.slice(0, ${maxResults}));
  `;

  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout: TIMEOUT_MS },
    );
    const parsed = JSON.parse(stdout.trim()) as CalendarEvent[];
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not allowed") || msg.includes("denied")) {
      throw new Error("Calendar access denied — grant Terminal/geofrey access in System Settings → Privacy & Security → Calendars");
    }
    throw new Error(`Failed to read macOS Calendar: ${msg}`);
  }
}

/**
 * List available local calendars.
 */
export async function listLocalCalendars(): Promise<Array<{ name: string; uid: string }>> {
  const script = `
    var app = Application("Calendar");
    var cals = app.calendars();
    var result = [];
    for (var i = 0; i < cals.length; i++) {
      result.push({ name: cals[i].name(), uid: cals[i].uid() });
    }
    JSON.stringify(result);
  `;

  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout: TIMEOUT_MS },
    );
    return JSON.parse(stdout.trim());
  } catch {
    return [];
  }
}

/**
 * Check if macOS Calendar.app is accessible.
 */
export async function isAppleCalendarAvailable(): Promise<boolean> {
  try {
    await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", 'Application("Calendar"); "ok"'],
      { timeout: 5000 },
    );
    return true;
  } catch {
    return false;
  }
}
