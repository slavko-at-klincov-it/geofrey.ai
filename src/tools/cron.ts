import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import { createJob, deleteJob, listJobs } from "../automation/scheduler.js";
import { t } from "../i18n/index.js";
import type { ScheduledJob } from "../automation/scheduler.js";

function formatJob(job: ScheduledJob): string {
  const status = job.enabled ? "enabled" : "disabled";
  const nextRun = job.nextRunAt.toISOString();
  return `[${job.id}] ${job.type} "${job.task}" schedule=${job.schedule} next=${nextRun} retries=${job.retryCount}/${job.maxRetries} ${status}`;
}

registerTool({
  name: "cron",
  description: "Manage scheduled tasks: create, list, or delete cron jobs. Types: 'at' (one-shot ISO date), 'every' (recurring ms interval), 'cron' (5-field cron expression).",
  parameters: z.object({
    action: z.enum(["create", "list", "delete"]),
    type: z.enum(["at", "every", "cron"]).optional().describe("Job type (required for create)"),
    schedule: z.string().optional().describe("ISO date for 'at', ms interval for 'every', cron expression for 'cron'"),
    task: z.string().optional().describe("Command text to execute"),
    jobId: z.string().optional().describe("Job ID (required for delete)"),
    chatId: z.string().optional().describe("Chat ID for filtering (list) or assignment (create)"),
  }),
  source: "native",
  execute: async ({ action, type, schedule, task, jobId, chatId }) => {
    switch (action) {
      case "create": {
        if (!type) return "Error: 'type' is required for create";
        if (!schedule) return "Error: 'schedule' is required for create";
        if (!task) return "Error: 'task' is required for create";

        try {
          const job = createJob({
            type,
            chatId: chatId ?? "default",
            task,
            schedule,
          });
          return t("cron.created", { id: job.id }) + "\n" + formatJob(job);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error creating job: ${msg}`;
        }
      }

      case "list": {
        const jobs = listJobs(chatId);
        if (jobs.length === 0) return t("cron.listEmpty");
        const header = t("cron.listHeader", { count: String(jobs.length) });
        const lines = jobs.map(formatJob);
        return `${header}\n${lines.join("\n")}`;
      }

      case "delete": {
        if (!jobId) return "Error: 'jobId' is required for delete";
        const deleted = deleteJob(jobId);
        if (!deleted) return t("cron.notFound", { id: jobId });
        return t("cron.deleted", { id: jobId });
      }
    }
  },
});
