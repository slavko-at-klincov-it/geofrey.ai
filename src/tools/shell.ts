import { execa } from "execa";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";

const SHELL_TIMEOUT_MS = 30_000;

registerTool({
  name: "shell_exec",
  description: "Execute a shell command",
  parameters: z.object({
    command: z.string(),
    cwd: z.string().optional(),
  }),
  source: "native",
  execute: async ({ command, cwd }) => {
    const result = await execa("sh", ["-c", command], {
      cwd,
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
