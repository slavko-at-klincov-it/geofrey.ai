import {
  createContainer,
  destroyContainer,
  isContainerRunning,
  type SandboxOptions,
} from "./container.js";
import { buildVolumeMount } from "./volume-mount.js";

// ── Types ──────────────────────────────────────────────────────────────────

interface PoolEntry {
  containerId: string;
  sessionId: string;
  ttlTimer: ReturnType<typeof setTimeout>;
  createdAt: number;
}

// ── State ──────────────────────────────────────────────────────────────────

const pool = new Map<string, PoolEntry>();

// ── Pool operations ────────────────────────────────────────────────────────

export async function getOrCreateContainer(
  sessionId: string,
  opts: SandboxOptions,
): Promise<string> {
  const existing = pool.get(sessionId);

  if (existing) {
    // Verify container is still running
    const running = await isContainerRunning(existing.containerId);
    if (running) {
      return existing.containerId;
    }
    // Container died — clean up entry and recreate
    clearTimeout(existing.ttlTimer);
    pool.delete(sessionId);
  }

  const volumeFlag = buildVolumeMount({ readOnly: opts.readOnly });
  const containerId = await createContainer(sessionId, opts, volumeFlag);

  const ttlTimer = setTimeout(() => {
    void destroySession(sessionId);
  }, opts.ttlMs);

  // Prevent timer from keeping Node.js alive
  if (ttlTimer.unref) {
    ttlTimer.unref();
  }

  pool.set(sessionId, {
    containerId,
    sessionId,
    ttlTimer,
    createdAt: Date.now(),
  });

  return containerId;
}

export async function destroySession(sessionId: string): Promise<void> {
  const entry = pool.get(sessionId);
  if (!entry) return;

  clearTimeout(entry.ttlTimer);
  pool.delete(sessionId);

  await destroyContainer(entry.containerId);
}

export async function destroyAllSessions(): Promise<void> {
  const entries = Array.from(pool.values());
  pool.clear();

  await Promise.allSettled(
    entries.map(async (entry) => {
      clearTimeout(entry.ttlTimer);
      await destroyContainer(entry.containerId);
    }),
  );
}

export function getPoolSize(): number {
  return pool.size;
}

export function getSessionContainerId(sessionId: string): string | undefined {
  return pool.get(sessionId)?.containerId;
}

export function getSessionInfo(sessionId: string): { containerId: string; createdAt: number } | undefined {
  const entry = pool.get(sessionId);
  if (!entry) return undefined;
  return { containerId: entry.containerId, createdAt: entry.createdAt };
}

// ── Test helpers ───────────────────────────────────────────────────────────

/** @internal Exposed for tests only */
export function _testClearPool(): void {
  for (const entry of pool.values()) {
    clearTimeout(entry.ttlTimer);
  }
  pool.clear();
}
