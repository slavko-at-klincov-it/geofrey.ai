import { execa } from "execa";
import { platform } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import { t } from "../i18n/index.js";
import type { SandboxOptions } from "../sandbox/container.js";

const SHELL_TIMEOUT_MS = 30_000;
const IS_WINDOWS = platform() === "win32";

// ── Sandbox configuration ───────────────────────────────────────────────

interface ShellSandboxConfig {
  enabled: boolean;
  image: string;
  memoryLimit: string;
  networkEnabled: boolean;
  pidsLimit: number;
  readOnly: boolean;
  ttlMs: number;
}

let sandboxConfig: ShellSandboxConfig = { enabled: false, image: "node:22-slim", memoryLimit: "512m", networkEnabled: false, pidsLimit: 64, readOnly: false, ttlMs: 1_800_000 };
let activeChatId: string = "default";

export function setSandboxConfig(config: ShellSandboxConfig): void {
  sandboxConfig = config;
}

export function setActiveChatId(chatId: string): void {
  activeChatId = chatId;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function confineShellCwd(dir: string | undefined): string | undefined {
  if (!dir) return undefined;
  const resolved = resolve(dir);
  const root = process.cwd();
  if (!resolved.startsWith(root + "/") && resolved !== root) {
    throw new Error(t("tools.dirOutsideProject", { dir }));
  }
  return resolved;
}

async function execInSandbox(command: string): Promise<string> {
  const { getOrCreateContainer } = await import("../sandbox/session-pool.js");
  const { execInContainer } = await import("../sandbox/container.js");

  const opts: SandboxOptions = {
    image: sandboxConfig.image,
    memoryLimit: sandboxConfig.memoryLimit,
    networkEnabled: sandboxConfig.networkEnabled,
    pidsLimit: sandboxConfig.pidsLimit,
    readOnly: sandboxConfig.readOnly,
    ttlMs: sandboxConfig.ttlMs,
  };

  const containerId = await getOrCreateContainer(activeChatId, opts);
  const result = await execInContainer(containerId, command);

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (result.exitCode !== 0) {
    return `EXIT ${result.exitCode}\n${output}`;
  }
  return output || "(no output)";
}

// ── Tool registration ───────────────────────────────────────────────────

registerTool({
  name: "shell_exec",
  description: "Execute a shell command",
  parameters: z.object({
    command: z.string(),
    cwd: z.string().optional(),
  }),
  source: "native",
  execute: async ({ command, cwd }) => {
    // Try sandbox execution if enabled
    if (sandboxConfig.enabled) {
      try {
        return await execInSandbox(command);
      } catch {
        // Fall back to direct execution if Docker unavailable
      }
    }

    const safeCwd = confineShellCwd(cwd);
    const shell = IS_WINDOWS ? "cmd" : "sh";
    const shellArgs = IS_WINDOWS ? ["/c", command] : ["-c", command];
    const result = await execa(shell, shellArgs, {
      cwd: safeCwd,
      timeout: SHELL_TIMEOUT_MS,
      reject: false,
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    if (result.exitCode !== 0) {
      return `EXIT ${result.exitCode}\n${output}`;
    }
    return output || "(no output)";
  },
});
