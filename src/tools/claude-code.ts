import { execa } from "execa";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";

const CLAUDE_TIMEOUT_MS = 300_000; // 5 min for complex tasks

registerTool({
  name: "claude_code",
  description: "Run a task via Claude Code CLI",
  parameters: z.object({
    prompt: z.string(),
    cwd: z.string().optional(),
  }),
  source: "native",
  execute: async ({ prompt, cwd }) => {
    const result = await execa("claude", ["--print", prompt], {
      cwd,
      timeout: CLAUDE_TIMEOUT_MS,
      reject: false,
    });

    if (result.exitCode !== 0) {
      return `Claude Code error (${result.exitCode}): ${result.stderr}`;
    }
    return result.stdout || "(no output)";
  },
});
