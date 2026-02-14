import { cpus, totalmem, freemem, hostname, platform, arch, release, uptime } from "node:os";
import { formatSize } from "./helpers.js";
import { t } from "../i18n/index.js";

/** Get system information (CPU, memory, OS). */
export function systemInfoOp(): string {
  const cpuInfo = cpus();
  const cpuModel = cpuInfo[0]?.model ?? "unknown";
  const cores = cpuInfo.length;
  const totalMem = totalmem();
  const freeMem = freemem();
  const usedMem = totalMem - freeMem;

  return [
    `Hostname: ${hostname()}`,
    `Platform: ${platform()} ${arch()}`,
    `OS Release: ${release()}`,
    `Uptime: ${Math.floor(uptime() / 3600)}h ${Math.floor((uptime() % 3600) / 60)}m`,
    `CPU: ${cpuModel} (${cores} cores)`,
    `Memory: ${formatSize(usedMem)} / ${formatSize(totalMem)} (${formatSize(freeMem)} free)`,
  ].join("\n");
}

/** Get disk space usage (uses df on Unix, wmic on Windows). */
export async function diskSpaceOp(): Promise<string> {
  const { execSync } = await import("node:child_process");

  if (platform() === "win32") {
    try {
      const output = execSync("wmic logicaldisk get size,freespace,caption", { encoding: "utf-8" });
      return output.trim();
    } catch {
      return t("localOps.diskSpaceFailed");
    }
  }

  try {
    const output = execSync("df -h", { encoding: "utf-8" });
    return output.trim();
  } catch {
    return t("localOps.diskSpaceFailed");
  }
}

/** Get an environment variable value. */
export function envGetOp(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    return t("localOps.envNotSet", { name });
  }
  // Redact sensitive-looking values
  const sensitive = /secret|token|key|password|credential/i;
  if (sensitive.test(name)) {
    return `${name}=${value.slice(0, 4)}***`;
  }
  return `${name}=${value}`;
}
