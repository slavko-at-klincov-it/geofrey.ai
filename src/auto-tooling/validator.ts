import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
  summary: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SENSITIVE_PATTERNS = [".env", ".pem", ".key", "credentials.json"];

// ── Main ───────────────────────────────────────────────────────────────────

export async function validateBuild(projectDir: string): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];

  // Check 1: package.json exists
  const hasPackageJson = await fileExists(join(projectDir, "package.json"));
  checks.push({
    name: "package.json",
    passed: hasPackageJson,
    detail: hasPackageJson ? "Found" : "Missing — no package.json",
  });

  // Check 2: At least one .ts or .js source file
  const sourceFiles = await findFiles(projectDir, /\.(ts|js)$/);
  const hasSource = sourceFiles.length > 0;
  checks.push({
    name: "source_files",
    passed: hasSource,
    detail: hasSource ? `${sourceFiles.length} source file(s)` : "No .ts or .js files found",
  });

  // Check 3: At least one test file
  const testFiles = sourceFiles.filter(
    (f) => f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__"),
  );
  const hasTests = testFiles.length > 0;
  checks.push({
    name: "test_files",
    passed: hasTests,
    detail: hasTests ? `${testFiles.length} test file(s)` : "No test files found",
  });

  // Check 4: CLAUDE.md exists
  const hasClaudeMd = await fileExists(join(projectDir, "CLAUDE.md"));
  checks.push({
    name: "claude_md",
    passed: hasClaudeMd,
    detail: hasClaudeMd ? "Found" : "Missing",
  });

  // Check 5: No sensitive files (credentials, .env with secrets)
  const hasSensitive = await checkSensitiveFiles(projectDir);
  checks.push({
    name: "no_sensitive_files",
    passed: !hasSensitive,
    detail: hasSensitive ? "WARNING: sensitive files detected" : "Clean",
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const valid = checks
    .filter((c) => ["package.json", "source_files"].includes(c.name))
    .every((c) => c.passed);

  return {
    valid,
    checks,
    summary: `${passedCount}/${checks.length} checks passed`,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function findFiles(dir: string, pattern: RegExp, depth = 3): Promise<string[]> {
  if (depth <= 0) return [];
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isFile() && pattern.test(entry.name)) {
        results.push(full);
      } else if (entry.isDirectory()) {
        results.push(...await findFiles(full, pattern, depth - 1));
      }
    }
  } catch {
    // Permission error or dir not found
  }
  return results;
}

async function checkSensitiveFiles(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.some((e) => SENSITIVE_PATTERNS.some((p) => e.includes(p)));
  } catch {
    return false;
  }
}
