import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isDockerAvailable,
  createContainer,
  destroyContainer,
  execInContainer,
  isContainerRunning,
  buildContainerName,
  type SandboxOptions,
} from "../../sandbox/container.js";
import { ensureDocker } from "./helpers/docker-guard.js";

const DEFAULT_OPTS: SandboxOptions = {
  image: "node:22-slim",
  memoryLimit: "128m",
  networkEnabled: false,
  pidsLimit: 32,
  readOnly: false,
  ttlMs: 60_000,
};

describe("E2E: Docker Sandbox Containers", { timeout: 120_000 }, () => {
  let dockerAvailable = false;
  const containerIds: string[] = [];

  before(async () => {
    const guard = await ensureDocker();
    dockerAvailable = !guard.skip;
  });

  after(async () => {
    // Cleanup all containers created during tests
    for (const id of containerIds) {
      try {
        await destroyContainer(id);
      } catch { /* ignore */ }
    }
  });

  it("isDockerAvailable() returns boolean (Docker required)", async (t) => {
    if (!dockerAvailable) {
      t.skip("Docker not available");
      return;
    }
    const result = await isDockerAvailable();
    assert.equal(result, true);
  });

  it("creates and destroys a container (Docker required)", async (t) => {
    if (!dockerAvailable) {
      t.skip("Docker not available");
      return;
    }

    const sessionId = `e2e-lifecycle-${Date.now()}`;
    const containerId = await createContainer(sessionId, DEFAULT_OPTS, "");
    containerIds.push(containerId);
    assert.ok(containerId.length > 0, "Should return container ID");

    const running = await isContainerRunning(containerId);
    assert.equal(running, true, "Container should be running");

    await destroyContainer(containerId);
    const afterDestroy = await isContainerRunning(containerId);
    assert.equal(afterDestroy, false, "Container should not be running after destroy");
  });

  it("executes command inside container (Docker required)", async (t) => {
    if (!dockerAvailable) {
      t.skip("Docker not available");
      return;
    }

    const sessionId = `e2e-exec-${Date.now()}`;
    const containerId = await createContainer(sessionId, DEFAULT_OPTS, "");
    containerIds.push(containerId);

    const result = await execInContainer(containerId, "echo hello");
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), "hello");
  });

  it("enforces network isolation (Docker required)", async (t) => {
    if (!dockerAvailable) {
      t.skip("Docker not available");
      return;
    }

    const sessionId = `e2e-net-${Date.now()}`;
    const containerId = await createContainer(sessionId, { ...DEFAULT_OPTS, networkEnabled: false }, "");
    containerIds.push(containerId);

    // Install curl is not available in slim, but trying to make any network request should fail
    const result = await execInContainer(containerId, "node -e \"fetch('http://example.com').then(r=>console.log(r.status)).catch(e=>console.error(e.message))\"");
    // With network disabled, fetch should fail
    assert.ok(
      result.exitCode !== 0 || result.stderr.includes("fetch") || result.stdout.includes("fetch"),
      "Network request should fail with network disabled",
    );
  });

  it("enforces memory limit (Docker required)", async (t) => {
    if (!dockerAvailable) {
      t.skip("Docker not available");
      return;
    }

    const sessionId = `e2e-mem-${Date.now()}`;
    const containerId = await createContainer(
      sessionId,
      { ...DEFAULT_OPTS, memoryLimit: "32m" },
      "",
    );
    containerIds.push(containerId);

    // Try to allocate 64MB — should OOM or fail
    const result = await execInContainer(
      containerId,
      "node -e \"const b = Buffer.alloc(64 * 1024 * 1024); console.log('ok')\"",
    );
    // Either exits non-zero (OOM killed) or the process is killed
    assert.ok(
      result.exitCode !== 0 || !result.stdout.includes("ok"),
      "64MB allocation should fail in 32MB container",
    );
  });

  it("mounts host volume into container (Docker required)", async (t) => {
    if (!dockerAvailable) {
      t.skip("Docker not available");
      return;
    }

    const hostDir = await mkdtemp(join(tmpdir(), "geofrey-vol-"));
    await writeFile(join(hostDir, "test.txt"), "hello from host");

    const sessionId = `e2e-vol-${Date.now()}`;
    const volumeFlag = `${hostDir}:/workspace:ro`;
    const containerId = await createContainer(sessionId, DEFAULT_OPTS, volumeFlag);
    containerIds.push(containerId);

    const result = await execInContainer(containerId, "cat /workspace/test.txt");
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), "hello from host");
  });

  it("sanitizes container names from session IDs", () => {
    // Valid session IDs
    assert.equal(buildContainerName("abc-123"), "geofrey-abc-123");
    assert.equal(buildContainerName("test_session"), "geofrey-test_session");

    // Special characters get stripped
    assert.equal(buildContainerName("hello world!@#"), "geofrey-helloworld");

    // Empty after sanitization throws
    assert.throws(() => buildContainerName("!@#$%"), /Invalid session ID/);
  });
});
