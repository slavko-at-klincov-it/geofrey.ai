import { createJob } from "../automation/scheduler.js";
import { spawnProcess } from "../process/manager.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RegistrationResult {
  type: "cron_job" | "background_process" | "one_shot";
  id: string;
  detail: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const AUTOTOOL_PREFIX = "__autotool_run__";
const DEFAULT_CRON_SCHEDULE = "0 * * * *"; // Every hour

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Register the auto-tool based on its output type.
 */
export function registerAutoTool(
  projectDir: string,
  outputType: "cron_job" | "background_process" | "one_shot" | "unknown",
  chatId: string,
  schedule?: string,
): RegistrationResult {
  switch (outputType) {
    case "cron_job": {
      const cronSchedule = schedule ?? DEFAULT_CRON_SCHEDULE;
      const job = createJob({
        type: "cron",
        chatId,
        task: `${AUTOTOOL_PREFIX} ${projectDir}`,
        schedule: cronSchedule,
      });
      return {
        type: "cron_job",
        id: job.id,
        detail: `Cron job created: ${cronSchedule}`,
      };
    }
    case "background_process": {
      const proc = spawnProcess({
        name: `autotool-${Date.now()}`,
        command: `cd "${projectDir}" && npm start`,
      });
      return {
        type: "background_process",
        id: String(proc.pid),
        detail: `Background process started: PID ${proc.pid}`,
      };
    }
    case "one_shot":
    default: {
      return {
        type: "one_shot",
        id: "manual",
        detail: `Program built at ${projectDir}. Run: cd ${projectDir} && npm start`,
      };
    }
  }
}

// ── Task helpers ───────────────────────────────────────────────────────────

/**
 * Check if a task string is an auto-tool execution.
 */
export function isAutoToolTask(task: string): boolean {
  return task.startsWith(AUTOTOOL_PREFIX);
}

/**
 * Extract project dir from auto-tool task string.
 */
export function extractProjectDir(task: string): string {
  return task.replace(AUTOTOOL_PREFIX, "").trim();
}
