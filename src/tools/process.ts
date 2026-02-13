import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import {
  spawnProcess,
  listProcesses,
  checkProcess,
  killProcess,
  getProcessLogs,
} from "../process/manager.js";
import { t } from "../i18n/index.js";

function formatUptime(startedAt: Date): string {
  const ms = Date.now() - startedAt.getTime();
  const seconds = Math.floor(ms / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h${remainingMins}m`;
}

registerTool({
  name: "process_manager",
  description:
    "Manage background processes: spawn, list, check, kill, or view logs.",
  parameters: z.object({
    action: z.enum(["list", "check", "kill", "spawn", "logs"]),
    pid: z.coerce.number().int().optional().describe("Process ID (required for check/kill/logs)"),
    command: z.string().optional().describe("Shell command to run (required for spawn)"),
    name: z.string().optional().describe("Process name (required for spawn)"),
    cwd: z.string().optional().describe("Working directory for spawn"),
    lines: z.coerce.number().int().optional().describe("Number of log lines to return (default 50)"),
  }),
  source: "native",
  execute: async ({ action, pid, command, name, cwd, lines }) => {
    switch (action) {
      case "list": {
        const procs = listProcesses();
        if (procs.length === 0) return t("process.listEmpty");
        const header = t("process.listHeader", { count: String(procs.length) });
        const entries = procs.map((p) =>
          `[${p.pid}] ${p.name} "${p.command}" status=${p.status} uptime=${formatUptime(p.startedAt)}`,
        );
        return `${header}\n${entries.join("\n")}`;
      }

      case "check": {
        if (pid === undefined) return t("tools.paramRequired", { param: "pid", action: "check" });
        const info = checkProcess(pid);
        if (!info) return t("process.notFound", { pid: String(pid) });
        const exitStr = info.exitCode !== undefined ? ` exit=${info.exitCode}` : "";
        return `[${info.pid}] ${info.name} "${info.command}" status=${info.status}${exitStr} uptime=${formatUptime(info.startedAt)}`;
      }

      case "kill": {
        if (pid === undefined) return t("tools.paramRequired", { param: "pid", action: "kill" });
        const entry = checkProcess(pid);
        if (!entry) return t("process.notFound", { pid: String(pid) });
        const result = await killProcess(pid);
        if (!result.killed) return t("process.notFound", { pid: String(pid) });
        if (result.forced) return t("process.killedForced", { pid: String(pid), name: entry.name });
        return t("process.killed", { pid: String(pid), name: entry.name });
      }

      case "spawn": {
        if (!name) return t("tools.paramRequired", { param: "name", action: "spawn" });
        if (!command) return t("tools.paramRequired", { param: "command", action: "spawn" });
        try {
          const info = spawnProcess({ name, command, cwd });
          return t("process.spawned", { pid: String(info.pid), name: info.name });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return t("process.spawnFailed", { msg });
        }
      }

      case "logs": {
        if (pid === undefined) return t("tools.paramRequired", { param: "pid", action: "logs" });
        const proc = checkProcess(pid);
        if (!proc) return t("process.notFound", { pid: String(pid) });
        const logLines = getProcessLogs(pid, lines);
        if (logLines.length === 0) return t("process.noLogs", { pid: String(pid) });
        return logLines.join("\n");
      }
    }
  },
});

// Re-export for graceful shutdown integration
export { killAllProcesses } from "../process/manager.js";
