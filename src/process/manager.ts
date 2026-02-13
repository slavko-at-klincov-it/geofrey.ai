import { execa, type ResultPromise } from "execa";
import { platform } from "node:os";

const IS_WINDOWS = platform() === "win32";
const SHELL = IS_WINDOWS ? "cmd" : "sh";
const SHELL_FLAG = IS_WINDOWS ? "/c" : "-c";
const MAX_LOG_LINES = 1_000;
const SIGTERM_TIMEOUT_MS = 5_000;
const KILL_ALL_GRACE_MS = 3_000;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProcessInfo {
  pid: number;
  name: string;
  command: string;
  startedAt: Date;
  status: "running" | "stopped" | "errored";
  exitCode?: number;
}

export interface SpawnOptions {
  name: string;
  command: string;
  cwd?: string;
}

interface LogBuffer {
  lines: string[];
  maxLines: number;
}

interface TrackedProcess {
  info: ProcessInfo;
  handle: ResultPromise;
  logs: LogBuffer;
}

// ── Internal state ─────────────────────────────────────────────────────────

const tracked = new Map<number, TrackedProcess>();

// ── Helpers ────────────────────────────────────────────────────────────────

function pushLogLine(buf: LogBuffer, line: string): void {
  buf.lines.push(line);
  if (buf.lines.length > buf.maxLines) {
    buf.lines.shift();
  }
}

function pipeToBuffer(stream: NodeJS.ReadableStream | null, buf: LogBuffer): void {
  if (!stream) return;
  let partial = "";
  stream.on("data", (chunk: Buffer | string) => {
    const text = partial + String(chunk);
    const lines = text.split("\n");
    // Last element is either empty (if ended with \n) or a partial line
    partial = lines.pop() ?? "";
    for (const line of lines) {
      pushLogLine(buf, line);
    }
  });
  stream.on("end", () => {
    if (partial) {
      pushLogLine(buf, partial);
      partial = "";
    }
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function spawnProcess(opts: SpawnOptions): ProcessInfo {
  const child = execa(SHELL, [SHELL_FLAG, opts.command], {
    cwd: opts.cwd,
    reject: false,
    stdout: "pipe",
    stderr: "pipe",
  });

  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("Failed to spawn process — no PID assigned");
  }

  const info: ProcessInfo = {
    pid,
    name: opts.name,
    command: opts.command,
    startedAt: new Date(),
    status: "running",
  };

  const logs: LogBuffer = { lines: [], maxLines: MAX_LOG_LINES };

  pipeToBuffer(child.stdout, logs);
  pipeToBuffer(child.stderr, logs);

  const entry: TrackedProcess = { info, handle: child, logs };
  tracked.set(pid, entry);

  // Listen for exit — update status (don't await the promise)
  child.then((result) => {
    info.exitCode = result.exitCode;
    info.status = result.exitCode === 0 ? "stopped" : "errored";
  }).catch(() => {
    info.status = "errored";
  });

  return { ...info };
}

export function listProcesses(): ProcessInfo[] {
  return Array.from(tracked.values()).map((entry) => ({ ...entry.info }));
}

export function checkProcess(pid: number): ProcessInfo | undefined {
  const entry = tracked.get(pid);
  if (!entry) return undefined;

  // Verify running status via signal 0
  if (entry.info.status === "running" && !isProcessAlive(pid)) {
    entry.info.status = "errored";
  }

  return { ...entry.info };
}

export async function killProcess(pid: number): Promise<{ killed: boolean; forced: boolean }> {
  const entry = tracked.get(pid);
  if (!entry) return { killed: false, forced: false };

  // Already stopped
  if (entry.info.status !== "running") {
    return { killed: true, forced: false };
  }

  // Send SIGTERM
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may have already exited
    entry.info.status = "stopped";
    return { killed: true, forced: false };
  }

  // Wait up to 5 seconds for graceful exit
  const deadline = Date.now() + SIGTERM_TIMEOUT_MS;
  while (Date.now() < deadline && isProcessAlive(pid)) {
    await new Promise((r) => setTimeout(r, 100));
  }

  // Check if it exited
  if (!isProcessAlive(pid)) {
    if (entry.info.status === "running") {
      entry.info.status = "stopped";
    }
    return { killed: true, forced: false };
  }

  // Force kill
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone
  }

  // Brief wait for SIGKILL to take effect
  await new Promise((r) => setTimeout(r, 200));
  entry.info.status = "stopped";

  return { killed: true, forced: true };
}

export function getProcessLogs(pid: number, lines?: number): string[] {
  const entry = tracked.get(pid);
  if (!entry) return [];

  const count = Math.min(Math.max(lines ?? 50, 1), MAX_LOG_LINES);
  return entry.logs.lines.slice(-count);
}

export async function killAllProcesses(): Promise<void> {
  const running = Array.from(tracked.values()).filter(
    (e) => e.info.status === "running",
  );

  if (running.length === 0) return;

  // SIGTERM all
  for (const entry of running) {
    try {
      process.kill(entry.info.pid, "SIGTERM");
    } catch {
      entry.info.status = "stopped";
    }
  }

  // Wait grace period
  const deadline = Date.now() + KILL_ALL_GRACE_MS;
  while (Date.now() < deadline) {
    const stillAlive = running.filter((e) => isProcessAlive(e.info.pid));
    if (stillAlive.length === 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  // SIGKILL remaining
  for (const entry of running) {
    if (isProcessAlive(entry.info.pid)) {
      try {
        process.kill(entry.info.pid, "SIGKILL");
      } catch {
        // Already gone
      }
    }
    entry.info.status = "stopped";
  }

  // Brief wait for cleanup
  await new Promise((r) => setTimeout(r, 200));
}

/** Clear all tracked processes (for testing) */
export function _testClearAll(): void {
  tracked.clear();
}
