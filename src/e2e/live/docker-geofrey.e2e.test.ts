import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execa } from "execa";
import { ensureDocker } from "./helpers/docker-guard.js";

const IMAGE_NAME = "geofrey-e2e-test";
const CONTAINER_NAME = "geofrey-e2e-container";

describe("E2E: Docker geofrey Image", { timeout: 600_000 }, () => {
  let dockerAvailable = false;
  let imageBuilt = false;
  let containerId = "";

  before(async () => {
    const guard = await ensureDocker();
    dockerAvailable = !guard.skip;
  });

  after(async () => {
    if (!dockerAvailable) return;
    // Cleanup container and image
    try {
      await execa("docker", ["rm", "-f", CONTAINER_NAME], { reject: false });
    } catch { /* ignore */ }
    try {
      await execa("docker", ["rmi", "-f", IMAGE_NAME], { reject: false });
    } catch { /* ignore */ }
  });

  it("Docker image builds successfully (Docker required)", async (t) => {
    if (!dockerAvailable) {
      t.skip("Docker not available");
      return;
    }

    const result = await execa("docker", ["build", "-t", IMAGE_NAME, "."], {
      cwd: process.cwd(),
      timeout: 300_000,
      reject: false,
    });
    assert.equal(result.exitCode, 0, `Docker build failed: ${result.stderr.slice(0, 500)}`);
    imageBuilt = true;
  });

  it("container starts successfully (Docker required)", async (t) => {
    if (!dockerAvailable || !imageBuilt) {
      t.skip(imageBuilt ? "Docker not available" : "Image not built");
      return;
    }

    const result = await execa("docker", [
      "run", "-d", "--name", CONTAINER_NAME, IMAGE_NAME, "sleep", "30",
    ], { reject: false, timeout: 30_000 });
    assert.equal(result.exitCode, 0, `Container start failed: ${result.stderr}`);
    containerId = result.stdout.trim();
    assert.ok(containerId.length > 0, "Should return container ID");
  });

  it("Node.js version is 22.x inside container (Docker required)", async (t) => {
    if (!dockerAvailable || !containerId) {
      t.skip("Container not running");
      return;
    }

    const result = await execa("docker", ["exec", containerId, "node", "--version"], {
      reject: false, timeout: 10_000,
    });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.trim().startsWith("v22"), `Expected v22.x, got ${result.stdout.trim()}`);
  });

  it("runs as non-root user 'geofrey' (Docker required)", async (t) => {
    if (!dockerAvailable || !containerId) {
      t.skip("Container not running");
      return;
    }

    const result = await execa("docker", ["exec", containerId, "whoami"], {
      reject: false, timeout: 10_000,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), "geofrey");
  });

  it("data volume is writable (Docker required)", async (t) => {
    if (!dockerAvailable || !containerId) {
      t.skip("Container not running");
      return;
    }

    const result = await execa("docker", [
      "exec", containerId, "touch", "/app/data/e2e-test.txt",
    ], { reject: false, timeout: 10_000 });
    assert.equal(result.exitCode, 0, `Data volume write failed: ${result.stderr}`);
  });
});
