import { resolve, relative } from "node:path";
import { realpathSync } from "node:fs";

// ── Constants ──────────────────────────────────────────────────────────────

const WORKSPACE_TARGET = "/workspace";

// ── Volume mount builder ───────────────────────────────────────────────────

export function buildVolumeMount(opts: { readOnly: boolean }): string {
  const cwd = process.cwd();
  const suffix = opts.readOnly ? ":ro" : "";
  return `${cwd}:${WORKSPACE_TARGET}${suffix}`;
}

// ── Path validation ────────────────────────────────────────────────────────

/**
 * Validates that a path does not traverse outside `process.cwd()`.
 * Rejects:
 * - Paths containing `..` sequences that escape cwd
 * - Absolute paths outside cwd
 * - Symlinks that resolve outside cwd (best-effort)
 */
export function validateMountPath(path: string): boolean {
  const cwd = process.cwd();

  // Reject null bytes
  if (path.includes("\0")) {
    return false;
  }

  // Resolve the path relative to cwd
  const resolved = resolve(cwd, path);

  // Must be inside cwd (same logic as filesystem.ts confine())
  if (resolved !== cwd && !resolved.startsWith(cwd + "/")) {
    return false;
  }

  // Best-effort symlink check: try to resolve realpath
  // If the file doesn't exist yet, realpathSync will throw — that's OK
  try {
    const real = realpathSync(resolved);
    if (real !== cwd && !real.startsWith(cwd + "/")) {
      return false;
    }
  } catch {
    // File doesn't exist yet — allow it (resolved path is already validated)
  }

  return true;
}

/**
 * Resolves a host path to the corresponding in-container path.
 * Returns null if the path is outside cwd.
 */
export function hostToContainerPath(hostPath: string): string | null {
  const cwd = process.cwd();
  const resolved = resolve(cwd, hostPath);

  if (resolved !== cwd && !resolved.startsWith(cwd + "/")) {
    return null;
  }

  const rel = relative(cwd, resolved);
  if (rel === "") {
    return WORKSPACE_TARGET;
  }
  return `${WORKSPACE_TARGET}/${rel}`;
}
