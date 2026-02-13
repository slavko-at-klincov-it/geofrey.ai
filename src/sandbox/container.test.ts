import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  isDockerAvailable,
  buildContainerName,
  createContainer,
  execInContainer,
  destroyContainer,
  isContainerRunning,
  type SandboxOptions,
} from "./container.js";

// ── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_OPTS: SandboxOptions = {
  image: "node:22-slim",
  memoryLimit: "512m",
  networkEnabled: false,
  pidsLimit: 64,
  readOnly: false,
  ttlMs: 1_800_000,
};

// ── buildContainerName ─────────────────────────────────────────────────────

describe("buildContainerName", () => {
  it("prefixes session ID with geofrey-", () => {
    const name = buildContainerName("abc123");
    assert.equal(name, "geofrey-abc123");
  });

  it("sanitizes special characters from session ID", () => {
    const name = buildContainerName("session/with:bad$chars");
    assert.equal(name, "geofrey-sessionwithbadchars");
  });

  it("preserves hyphens and underscores", () => {
    const name = buildContainerName("my-session_01");
    assert.equal(name, "geofrey-my-session_01");
  });

  it("throws for empty session ID after sanitization", () => {
    assert.throws(
      () => buildContainerName("///"),
      /Invalid session ID/,
    );
  });

  it("throws for session ID with only special characters", () => {
    assert.throws(
      () => buildContainerName("@#$%^"),
      /Invalid session ID/,
    );
  });
});

// ── isDockerAvailable ──────────────────────────────────────────────────────

describe("isDockerAvailable", () => {
  it("returns a boolean", async () => {
    const result = await isDockerAvailable();
    assert.equal(typeof result, "boolean");
  });
});

// ── createContainer (integration-safe) ─────────────────────────────────────

describe("createContainer", () => {
  it("rejects with descriptive error for invalid image", async () => {
    // Use an image that definitely doesn't exist locally
    const badOpts: SandboxOptions = {
      ...DEFAULT_OPTS,
      image: "geofrey-nonexistent-image-zzz:latest",
    };

    await assert.rejects(
      createContainer("test-bad-image", badOpts, ""),
      (err: Error) => {
        assert.ok(err.message.includes("Failed to create container"));
        return true;
      },
    );
  });
});

// ── execInContainer ────────────────────────────────────────────────────────

describe("execInContainer", () => {
  it("returns ExecResult with expected shape for nonexistent container", async () => {
    const result = await execInContainer("nonexistent-container-zzz", "echo hello");
    // Docker exec on nonexistent container returns exit code != 0
    assert.ok(result.exitCode !== 0);
    assert.equal(typeof result.stdout, "string");
    assert.equal(typeof result.stderr, "string");
  });
});

// ── destroyContainer ───────────────────────────────────────────────────────

describe("destroyContainer", () => {
  it("does not throw for nonexistent container", async () => {
    // docker rm -f on nonexistent container should not throw (reject: false)
    await assert.doesNotReject(destroyContainer("nonexistent-container-zzz"));
  });
});

// ── isContainerRunning ─────────────────────────────────────────────────────

describe("isContainerRunning", () => {
  it("returns false for nonexistent container", async () => {
    const running = await isContainerRunning("nonexistent-container-zzz");
    assert.equal(running, false);
  });
});

// ── SandboxOptions schema ──────────────────────────────────────────────────

describe("sandboxOptionsSchema", () => {
  it("validates correct options", async () => {
    const { sandboxOptionsSchema } = await import("./container.js");
    const result = sandboxOptionsSchema.safeParse(DEFAULT_OPTS);
    assert.equal(result.success, true);
  });

  it("rejects empty image", async () => {
    const { sandboxOptionsSchema } = await import("./container.js");
    const result = sandboxOptionsSchema.safeParse({ ...DEFAULT_OPTS, image: "" });
    assert.equal(result.success, false);
  });

  it("rejects negative pidsLimit", async () => {
    const { sandboxOptionsSchema } = await import("./container.js");
    const result = sandboxOptionsSchema.safeParse({ ...DEFAULT_OPTS, pidsLimit: -1 });
    assert.equal(result.success, false);
  });

  it("rejects zero ttlMs", async () => {
    const { sandboxOptionsSchema } = await import("./container.js");
    const result = sandboxOptionsSchema.safeParse({ ...DEFAULT_OPTS, ttlMs: 0 });
    assert.equal(result.success, false);
  });
});
