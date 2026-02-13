import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { SandboxOptions } from "./container.js";

// ── Mocking strategy ──────────────────────────────────────────────────────
// We mock the container module functions to avoid real Docker calls.
// The session-pool module calls container.js functions internally.
// Since ESM mocking is limited, we test the pool logic via its public API
// and use real Docker calls only where safe (nonexistent containers).

const DEFAULT_OPTS: SandboxOptions = {
  image: "node:22-slim",
  memoryLimit: "512m",
  networkEnabled: false,
  pidsLimit: 64,
  readOnly: false,
  ttlMs: 1_800_000,
};

// ── Pool unit tests (no Docker required) ───────────────────────────────────

describe("session-pool", () => {
  describe("getPoolSize", () => {
    it("returns 0 initially", async () => {
      const { getPoolSize, _testClearPool } = await import("./session-pool.js");
      _testClearPool();
      assert.equal(getPoolSize(), 0);
    });
  });

  describe("getSessionContainerId", () => {
    it("returns undefined for unknown session", async () => {
      const { getSessionContainerId, _testClearPool } = await import("./session-pool.js");
      _testClearPool();
      assert.equal(getSessionContainerId("nonexistent"), undefined);
    });
  });

  describe("getSessionInfo", () => {
    it("returns undefined for unknown session", async () => {
      const { getSessionInfo, _testClearPool } = await import("./session-pool.js");
      _testClearPool();
      assert.equal(getSessionInfo("nonexistent"), undefined);
    });
  });

  describe("destroySession", () => {
    it("does not throw for unknown session", async () => {
      const { destroySession, _testClearPool } = await import("./session-pool.js");
      _testClearPool();
      await assert.doesNotReject(destroySession("nonexistent"));
    });
  });

  describe("destroyAllSessions", () => {
    it("does not throw when pool is empty", async () => {
      const { destroyAllSessions, _testClearPool } = await import("./session-pool.js");
      _testClearPool();
      await assert.doesNotReject(destroyAllSessions());
    });

    it("clears the pool", async () => {
      const { destroyAllSessions, getPoolSize, _testClearPool } = await import("./session-pool.js");
      _testClearPool();
      await destroyAllSessions();
      assert.equal(getPoolSize(), 0);
    });
  });

  describe("_testClearPool", () => {
    it("resets pool to empty state", async () => {
      const { getPoolSize, _testClearPool } = await import("./session-pool.js");
      _testClearPool();
      assert.equal(getPoolSize(), 0);
    });
  });

  // ── Integration tests (require Docker) ─────────────────────────────────

  describe("getOrCreateContainer (Docker required)", () => {
    let dockerAvailable = false;

    beforeEach(async () => {
      const { isDockerAvailable } = await import("./container.js");
      const { _testClearPool } = await import("./session-pool.js");
      _testClearPool();
      dockerAvailable = await isDockerAvailable();
    });

    afterEach(async () => {
      if (dockerAvailable) {
        const { destroyAllSessions } = await import("./session-pool.js");
        await destroyAllSessions();
      }
    });

    it("creates a container and returns its ID", {
      skip: !dockerAvailable ? "Docker not available" : undefined,
    }, async () => {
      // Dynamic import to avoid stale module state
      const { getOrCreateContainer, getPoolSize, getSessionContainerId } = await import("./session-pool.js");

      const shortOpts: SandboxOptions = { ...DEFAULT_OPTS, ttlMs: 300_000 };
      const containerId = await getOrCreateContainer("test-create-1", shortOpts);

      assert.ok(typeof containerId === "string");
      assert.ok(containerId.length > 0);
      assert.equal(getPoolSize(), 1);
      assert.equal(getSessionContainerId("test-create-1"), containerId);
    });

    it("returns same container for same session", {
      skip: !dockerAvailable ? "Docker not available" : undefined,
    }, async () => {
      const { getOrCreateContainer } = await import("./session-pool.js");
      const shortOpts: SandboxOptions = { ...DEFAULT_OPTS, ttlMs: 300_000 };

      const id1 = await getOrCreateContainer("test-same-1", shortOpts);
      const id2 = await getOrCreateContainer("test-same-1", shortOpts);

      assert.equal(id1, id2);
    });

    it("creates different containers for different sessions", {
      skip: !dockerAvailable ? "Docker not available" : undefined,
    }, async () => {
      const { getOrCreateContainer, getPoolSize } = await import("./session-pool.js");
      const shortOpts: SandboxOptions = { ...DEFAULT_OPTS, ttlMs: 300_000 };

      const id1 = await getOrCreateContainer("test-diff-a", shortOpts);
      const id2 = await getOrCreateContainer("test-diff-b", shortOpts);

      assert.notEqual(id1, id2);
      assert.equal(getPoolSize(), 2);
    });

    it("destroySession removes container from pool", {
      skip: !dockerAvailable ? "Docker not available" : undefined,
    }, async () => {
      const { getOrCreateContainer, destroySession, getPoolSize, getSessionContainerId } = await import("./session-pool.js");
      const shortOpts: SandboxOptions = { ...DEFAULT_OPTS, ttlMs: 300_000 };

      await getOrCreateContainer("test-destroy-1", shortOpts);
      assert.equal(getPoolSize(), 1);

      await destroySession("test-destroy-1");
      assert.equal(getPoolSize(), 0);
      assert.equal(getSessionContainerId("test-destroy-1"), undefined);
    });

    it("destroyAllSessions cleans up all containers", {
      skip: !dockerAvailable ? "Docker not available" : undefined,
    }, async () => {
      const { getOrCreateContainer, destroyAllSessions, getPoolSize } = await import("./session-pool.js");
      const shortOpts: SandboxOptions = { ...DEFAULT_OPTS, ttlMs: 300_000 };

      await getOrCreateContainer("test-all-a", shortOpts);
      await getOrCreateContainer("test-all-b", shortOpts);
      assert.equal(getPoolSize(), 2);

      await destroyAllSessions();
      assert.equal(getPoolSize(), 0);
    });
  });

  describe("TTL auto-cleanup (Docker required)", () => {
    let dockerAvailable = false;

    beforeEach(async () => {
      const { isDockerAvailable } = await import("./container.js");
      const { _testClearPool } = await import("./session-pool.js");
      _testClearPool();
      dockerAvailable = await isDockerAvailable();
    });

    afterEach(async () => {
      if (dockerAvailable) {
        const { destroyAllSessions } = await import("./session-pool.js");
        await destroyAllSessions();
      }
    });

    it("auto-destroys container after TTL expires", {
      skip: !dockerAvailable ? "Docker not available" : undefined,
    }, async () => {
      const { getOrCreateContainer, getPoolSize } = await import("./session-pool.js");

      // Use very short TTL
      const shortOpts: SandboxOptions = { ...DEFAULT_OPTS, ttlMs: 500 };
      await getOrCreateContainer("test-ttl-1", shortOpts);
      assert.equal(getPoolSize(), 1);

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 1500));
      assert.equal(getPoolSize(), 0);
    });
  });
});
