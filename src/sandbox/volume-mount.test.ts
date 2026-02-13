import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildVolumeMount, validateMountPath, hostToContainerPath } from "./volume-mount.js";

// ── buildVolumeMount ───────────────────────────────────────────────────────

describe("buildVolumeMount", () => {
  it("builds read-write mount by default", () => {
    const mount = buildVolumeMount({ readOnly: false });
    const cwd = process.cwd();
    assert.equal(mount, `${cwd}:/workspace`);
  });

  it("builds read-only mount when readOnly is true", () => {
    const mount = buildVolumeMount({ readOnly: true });
    const cwd = process.cwd();
    assert.equal(mount, `${cwd}:/workspace:ro`);
  });

  it("always targets /workspace", () => {
    const mount = buildVolumeMount({ readOnly: false });
    assert.ok(mount.includes(":/workspace"));
  });
});

// ── validateMountPath ──────────────────────────────────────────────────────

describe("validateMountPath", () => {
  it("accepts relative path within cwd", () => {
    assert.equal(validateMountPath("src/index.ts"), true);
  });

  it("accepts current directory (dot)", () => {
    assert.equal(validateMountPath("."), true);
  });

  it("accepts nested relative path", () => {
    assert.equal(validateMountPath("src/sandbox/container.ts"), true);
  });

  it("rejects path with .. traversal outside cwd", () => {
    assert.equal(validateMountPath("../../etc/passwd"), false);
  });

  it("rejects absolute path outside cwd", () => {
    assert.equal(validateMountPath("/etc/passwd"), false);
  });

  it("rejects /tmp path", () => {
    assert.equal(validateMountPath("/tmp/evil"), false);
  });

  it("accepts absolute path that is inside cwd", () => {
    const cwd = process.cwd();
    assert.equal(validateMountPath(`${cwd}/src/index.ts`), true);
  });

  it("accepts cwd itself as absolute path", () => {
    const cwd = process.cwd();
    assert.equal(validateMountPath(cwd), true);
  });

  it("rejects path with null bytes", () => {
    assert.equal(validateMountPath("src/\0evil"), false);
  });

  it("rejects path that starts with cwd prefix but is different directory", () => {
    // e.g., if cwd is /home/user/project, reject /home/user/project-evil
    const cwd = process.cwd();
    assert.equal(validateMountPath(`${cwd}-evil/file`), false);
  });

  it("accepts empty string (resolves to cwd)", () => {
    assert.equal(validateMountPath(""), true);
  });

  it("rejects deeply nested traversal", () => {
    assert.equal(validateMountPath("a/b/c/../../../../etc/passwd"), false);
  });

  it("accepts path with .. that stays within cwd", () => {
    assert.equal(validateMountPath("src/../src/index.ts"), true);
  });
});

// ── hostToContainerPath ────────────────────────────────────────────────────

describe("hostToContainerPath", () => {
  it("maps cwd to /workspace", () => {
    const result = hostToContainerPath(".");
    assert.equal(result, "/workspace");
  });

  it("maps relative file to /workspace/relative", () => {
    const result = hostToContainerPath("src/index.ts");
    assert.equal(result, "/workspace/src/index.ts");
  });

  it("maps absolute file inside cwd to /workspace/relative", () => {
    const cwd = process.cwd();
    const result = hostToContainerPath(`${cwd}/src/index.ts`);
    assert.equal(result, "/workspace/src/index.ts");
  });

  it("returns null for path outside cwd", () => {
    const result = hostToContainerPath("/etc/passwd");
    assert.equal(result, null);
  });

  it("returns null for traversal outside cwd", () => {
    const result = hostToContainerPath("../../etc/passwd");
    assert.equal(result, null);
  });

  it("handles nested path correctly", () => {
    const result = hostToContainerPath("src/sandbox/container.ts");
    assert.equal(result, "/workspace/src/sandbox/container.ts");
  });
});
