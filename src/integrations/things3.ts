/**
 * Things 3 (macOS) integration via JXA.
 * Reads tasks directly from Things 3 app — no cloud, no API key.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 10_000;

export interface Things3Task {
  id: string;
  name: string;
  notes: string;
  dueDate?: string;
  tags: string[];
  project?: string;
}

/**
 * Fetch today's tasks from Things 3 (Today list).
 */
export async function listTodayTasks(): Promise<Things3Task[]> {
  const script = `
    var things = Application("Things3");
    var todos = things.lists.byName("Today").toDos();
    var result = [];
    for (var i = 0; i < todos.length && i < 30; i++) {
      var t = todos[i];
      try {
        var tags = [];
        try { tags = t.tagNames().split(", ").filter(function(s) { return s.length > 0; }); } catch(e) {}
        result.push({
          id: t.id(),
          name: t.name(),
          notes: t.notes() || "",
          dueDate: t.dueDate() ? t.dueDate().toISOString() : undefined,
          tags: tags,
          project: t.project() ? t.project().name() : undefined
        });
      } catch(e) { /* skip unreadable */ }
    }
    JSON.stringify(result);
  `;

  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout: TIMEOUT_MS },
    );
    return JSON.parse(stdout.trim()) as Things3Task[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not running") || msg.includes("not found")) {
      throw new Error("Things 3 is not running or not installed");
    }
    throw new Error(`Failed to read Things 3: ${msg}`);
  }
}
