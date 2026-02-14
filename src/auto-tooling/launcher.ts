import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDockerAvailable, createContainer, execInContainer, destroyContainer } from "../sandbox/container.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LaunchOptions {
  projectDir: string;
  projectName: string;
  claudeMdContent: string;
  prompt: string;
  systemPrompt: string;
  flags: string[];
  timeoutMs?: number;
  onProgress?: (text: string) => void;
}

export interface LaunchResult {
  success: boolean;
  exitCode: number;
  projectDir: string;
  output: string;
  durationMs: number;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const PROJECTS_BASE = ".geofrey/projects";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Creates the project directory and writes initial files.
 */
export async function scaffoldProject(
  projectDir: string,
  claudeMdContent: string,
): Promise<void> {
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "CLAUDE.md"), claudeMdContent, "utf-8");
}

/**
 * Generates a slug from a project name.
 */
export function projectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Returns the full project path.
 */
export function projectPath(slug: string): string {
  return join(process.cwd(), PROJECTS_BASE, slug);
}

// ── Main entry ─────────────────────────────────────────────────────────────

/**
 * Launches Claude Code to build the auto-tool.
 *
 * Strategy:
 * 1. If Docker is available → run in container
 * 2. If not → run directly with cwd isolation (still --dangerously-skip-permissions)
 */
export async function launchBuild(opts: LaunchOptions): Promise<LaunchResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Scaffold the project
  await scaffoldProject(opts.projectDir, opts.claudeMdContent);
  opts.onProgress?.("Project scaffolded, starting Claude Code...");

  const dockerAvailable = await isDockerAvailable().catch(() => false);

  if (dockerAvailable) {
    return launchInDocker(opts, start, timeoutMs);
  }

  return launchDirect(opts, start, timeoutMs);
}

// ── Docker path ────────────────────────────────────────────────────────────

async function launchInDocker(
  opts: LaunchOptions,
  start: number,
  timeoutMs: number,
): Promise<LaunchResult> {
  let containerId: string | undefined;

  try {
    opts.onProgress?.("Starting Docker container...");

    containerId = await createContainer(
      `autotool-${Date.now()}`,
      {
        image: "node:22-slim",
        memoryLimit: "2g",
        networkEnabled: true, // Needs npm install
        pidsLimit: 100,
        readOnly: false,
        ttlMs: timeoutMs,
      },
      `${opts.projectDir}:/workspace`,
    );

    // Install Claude Code in container
    await execInContainer(containerId, "npm install -g @anthropic-ai/claude-code 2>&1 || true");
    opts.onProgress?.("Claude Code installed in container");

    // Build the Claude Code command
    const flagStr = opts.flags.join(" ");
    const escapedPrompt = opts.prompt.replace(/'/g, "'\\''");
    const escapedSystem = opts.systemPrompt.replace(/'/g, "'\\''");
    const cmd = `cd /workspace && claude ${flagStr} --append-system-prompt '${escapedSystem}' --print '${escapedPrompt}' 2>&1`;

    const result = await execInContainer(containerId, cmd);
    opts.onProgress?.("Build complete");

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      projectDir: opts.projectDir,
      output: result.stdout + (result.stderr ? `\n${result.stderr}` : ""),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      exitCode: 1,
      projectDir: opts.projectDir,
      output: "",
      durationMs: Date.now() - start,
      error: msg,
    };
  } finally {
    if (containerId) {
      await destroyContainer(containerId).catch(() => {});
    }
  }
}

// ── Direct path (no Docker) ────────────────────────────────────────────────

async function launchDirect(
  opts: LaunchOptions,
  start: number,
  timeoutMs: number,
): Promise<LaunchResult> {
  try {
    const { execa } = await import("execa");

    opts.onProgress?.("Running Claude Code directly (no Docker)...");

    const args = [
      ...opts.flags,
      "--append-system-prompt", opts.systemPrompt,
      "--print", opts.prompt,
    ];

    const result = await execa("claude", args, {
      cwd: opts.projectDir,
      timeout: timeoutMs,
      reject: false,
    });

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode ?? 1,
      projectDir: opts.projectDir,
      output: result.stdout + (result.stderr ? `\n${result.stderr}` : ""),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      exitCode: 1,
      projectDir: opts.projectDir,
      output: "",
      durationMs: Date.now() - start,
      error: msg,
    };
  }
}
