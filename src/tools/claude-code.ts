import { execa } from "execa";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";

const CLAUDE_TIMEOUT_MS = 300_000; // 5 min for complex tasks
const TOKEN_LIMIT_PATTERN = /output.token.limit.exceeded|exceeded the \d+ output token maximum/i;
const CONCISE_SUFFIX =
  "\n\nIMPORTANT: Be concise. Limit your response length. Summarize where possible.";

function isTokenLimitError(stderr: string, stdout: string): boolean {
  return TOKEN_LIMIT_PATTERN.test(stderr) || TOKEN_LIMIT_PATTERN.test(stdout);
}

async function runClaude(
  prompt: string,
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execa(
    "claude",
    ["--print", "--output-format", "json", prompt],
    {
      cwd,
      timeout: CLAUDE_TIMEOUT_MS,
      reject: false,
      env: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: "64000" },
    },
  );
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 1,
  };
}

function parseOutput(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout);
    return parsed.result ?? parsed.text ?? parsed.content ?? stdout;
  } catch {
    return stdout;
  }
}

registerTool({
  name: "claude_code",
  description: "Run a task via Claude Code CLI",
  parameters: z.object({
    prompt: z.string(),
    cwd: z.string().optional(),
  }),
  source: "native",
  execute: async ({ prompt, cwd }) => {
    const result = await runClaude(prompt, cwd);

    if (result.exitCode === 0) {
      return parseOutput(result.stdout) || "(no output)";
    }

    // Retry once with concise instruction on token limit errors
    if (isTokenLimitError(result.stderr, result.stdout)) {
      const retry = await runClaude(prompt + CONCISE_SUFFIX, cwd);
      if (retry.exitCode === 0) {
        return parseOutput(retry.stdout) || "(no output)";
      }
      return `Claude Code error: output token limit exceeded after retry. ${retry.stderr}`;
    }

    return `Claude Code error (${result.exitCode}): ${result.stderr}`;
  },
});
