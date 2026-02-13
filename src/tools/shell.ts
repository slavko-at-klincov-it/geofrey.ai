import { execa } from "execa";
import { platform } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";

const SHELL_TIMEOUT_MS = 30_000;
const IS_WINDOWS = platform() === "win32";

function confineShellCwd(dir: string | undefined): string | undefined {
  if (!dir) return undefined;
  const resolved = resolve(dir);
  const root = process.cwd();
  if (!resolved.startsWith(root + "/") && resolved !== root) {
    throw new Error(`Directory "${dir}" is outside the project root`);
  }
  return resolved;
}

registerTool({
  name: "shell_exec",
  description: "Execute a shell command",
  parameters: z.object({
    command: z.string(),
    cwd: z.string().optional(),
  }),
  source: "native",
  execute: async ({ command, cwd }) => {
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
