/**
 * Apple Reminders (macOS) integration via JXA.
 * Reads reminders directly from Reminders.app — no cloud, no API key.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 10_000;

export interface AppleReminder {
  id: string;
  name: string;
  body: string;
  dueDate?: string;
  list: string;
  completed: boolean;
  priority: number;   // 0 = none, 1-9 (1 = high, 5 = medium, 9 = low)
}

/**
 * Fetch incomplete reminders due today (or overdue).
 */
export async function listTodayReminders(): Promise<AppleReminder[]> {
  const script = `
    var app = Application("Reminders");
    var now = new Date();
    var endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var results = [];
    var lists = app.lists();

    for (var l = 0; l < lists.length; l++) {
      var list = lists[l];
      var reminders;
      try {
        reminders = list.reminders.whose({ completed: false })();
      } catch(e) { continue; }

      for (var i = 0; i < reminders.length && results.length < 30; i++) {
        var r = reminders[i];
        try {
          var due = r.dueDate();
          // Include if: no due date (standing reminder), or due today/overdue
          if (due && due > endOfDay) continue;
          results.push({
            id: r.id(),
            name: r.name(),
            body: r.body() || "",
            dueDate: due ? due.toISOString() : undefined,
            list: list.name(),
            completed: false,
            priority: r.priority() || 0
          });
        } catch(e) { /* skip unreadable */ }
      }
    }

    // Sort: overdue first, then by priority (higher = more urgent for Apple: 1 is highest)
    results.sort(function(a, b) {
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return (a.priority || 99) - (b.priority || 99);
    });

    JSON.stringify(results);
  `;

  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout: TIMEOUT_MS },
    );
    return JSON.parse(stdout.trim()) as AppleReminder[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not allowed") || msg.includes("denied")) {
      throw new Error("Reminders access denied — grant access in System Settings → Privacy & Security → Reminders");
    }
    throw new Error(`Failed to read Reminders: ${msg}`);
  }
}
