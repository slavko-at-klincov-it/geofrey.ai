import { execa } from "execa";
import { z } from "zod";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SandboxOptions {
  image: string;
  memoryLimit: string;
  networkEnabled: boolean;
  pidsLimit: number;
  readOnly: boolean;
  ttlMs: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const sandboxOptionsSchema = z.object({
  image: z.string().min(1),
  memoryLimit: z.string().min(1),
  networkEnabled: z.boolean(),
  pidsLimit: z.number().int().positive(),
  readOnly: z.boolean(),
  ttlMs: z.number().int().positive(),
});

// ── Constants ──────────────────────────────────────────────────────────────

const CONTAINER_NAME_PREFIX = "geofrey-";
const DOCKER_TIMEOUT_MS = 30_000;
const EXEC_TIMEOUT_MS = 60_000;

// ── Docker availability ────────────────────────────────────────────────────

export async function isDockerAvailable(): Promise<boolean> {
  try {
    const result = await execa("docker", ["info"], {
      timeout: DOCKER_TIMEOUT_MS,
      reject: false,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

// ── Container lifecycle ────────────────────────────────────────────────────

export function buildContainerName(sessionId: string): string {
  // Sanitize session ID: only allow alphanumeric, hyphens, underscores
  const sanitized = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (sanitized.length === 0) {
    throw new Error("Invalid session ID: must contain alphanumeric characters");
  }
  return `${CONTAINER_NAME_PREFIX}${sanitized}`;
}

export async function createContainer(
  sessionId: string,
  opts: SandboxOptions,
  volumeFlag: string,
): Promise<string> {
  const containerName = buildContainerName(sessionId);

  const args: string[] = [
    "run", "-d", "--rm",
    "--name", containerName,
    "--memory", opts.memoryLimit,
    "--pids-limit", String(opts.pidsLimit),
    "--no-new-privileges",
  ];

  if (!opts.networkEnabled) {
    args.push("--network=none");
  }

  // Volume mount
  if (volumeFlag) {
    args.push("-v", volumeFlag);
  }

  args.push("-w", "/workspace");
  args.push(opts.image);
  args.push("sleep", "infinity");

  const result = await execa("docker", args, {
    timeout: DOCKER_TIMEOUT_MS,
    reject: false,
  });

  if (result.exitCode !== 0) {
    const errMsg = result.stderr || result.stdout || "unknown error";
    throw new Error(`Failed to create container: ${errMsg}`);
  }

  // docker run -d returns the full container ID
  return result.stdout.trim();
}

export async function execInContainer(
  containerId: string,
  command: string,
): Promise<ExecResult> {
  const result = await execa("docker", ["exec", containerId, "sh", "-c", command], {
    timeout: EXEC_TIMEOUT_MS,
    reject: false,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 1,
  };
}

export async function destroyContainer(containerId: string): Promise<void> {
  await execa("docker", ["rm", "-f", containerId], {
    timeout: DOCKER_TIMEOUT_MS,
    reject: false,
  });
}

export async function isContainerRunning(containerId: string): Promise<boolean> {
  try {
    const result = await execa(
      "docker",
      ["inspect", "--format={{.State.Running}}", containerId],
      { timeout: DOCKER_TIMEOUT_MS, reject: false },
    );
    return result.exitCode === 0 && result.stdout.trim() === "true";
  } catch {
    return false;
  }
}
