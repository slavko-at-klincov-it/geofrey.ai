import { execa } from "execa";
import { resolve } from "node:path";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import { t } from "../i18n/index.js";

function confineGitCwd(dir: string | undefined): string | undefined {
  if (!dir) return undefined;
  const resolved = resolve(dir);
  const root = process.cwd();
  if (!resolved.startsWith(root + "/") && resolved !== root) {
    throw new Error(t("tools.dirOutsideProject", { dir }));
  }
  return resolved;
}

async function git(args: string[], cwd?: string): Promise<string> {
  const safeCwd = confineGitCwd(cwd);
  const result = await execa("git", args, { cwd: safeCwd, reject: false });
  if (result.exitCode !== 0) {
    return t("tools.gitError", { exitCode: String(result.exitCode), stderr: result.stderr });
  }
  return result.stdout || "(no output)";
}

registerTool({
  name: "git_status",
  description: "Show git status",
  parameters: z.object({ cwd: z.string().optional() }),
  source: "native",
  execute: async ({ cwd }) => git(["status", "--short"], cwd),
});

registerTool({
  name: "git_log",
  description: "Show recent git log",
  parameters: z.object({
    count: z.number().default(10),
    cwd: z.string().optional(),
  }),
  source: "native",
  execute: async ({ count, cwd }) =>
    git(["log", `--oneline`, `-${count}`], cwd),
});

registerTool({
  name: "git_diff",
  description: "Show git diff",
  parameters: z.object({
    staged: z.boolean().default(false),
    cwd: z.string().optional(),
  }),
  source: "native",
  execute: async ({ staged, cwd }) =>
    git(staged ? ["diff", "--staged"] : ["diff"], cwd),
});

registerTool({
  name: "git_commit",
  description: "Create a git commit",
  parameters: z.object({
    message: z.string(),
    cwd: z.string().optional(),
  }),
  source: "native",
  execute: async ({ message, cwd }) =>
    git(["commit", "-m", message], cwd),
});
