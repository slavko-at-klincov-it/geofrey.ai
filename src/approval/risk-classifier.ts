import { generateText } from "ai";
import { createOllama } from "ai-sdk-ollama";
import type { Config } from "../config/schema.js";

export enum RiskLevel {
  L0 = "L0",
  L1 = "L1",
  L2 = "L2",
  L3 = "L3",
}

export interface Classification {
  level: RiskLevel;
  reason: string;
  deterministic: boolean;
}

const VALID_LEVELS = new Set([RiskLevel.L0, RiskLevel.L1, RiskLevel.L2, RiskLevel.L3]);

const RISK_CLASSIFIER_PROMPT = `You are a security risk classifier for an AI agent system. Your ONLY job is to classify tool/command requests into risk levels and return JSON.

ALWAYS respond with exactly this JSON structure, nothing else:
{"level": "L0"|"L1"|"L2"|"L3", "reason": "one-line explanation in German"}

Risk Levels:
- L0 AUTO_APPROVE: Read-only operations (read_file, list_dir, search, git status/log/diff, pwd, ls, cat, head, tail, wc)
- L1 NOTIFY: Low-risk modifications in project dir, reversible (write_file non-config, git add/stash/branch, npm test/lint)
- L2 REQUIRE_APPROVAL: Broader or harder-to-reverse impact (delete_file, git commit/merge/rebase/push, npm install, npx, bunx, shell_exec, mkdir, mv, cp, config file writes)
- L3 BLOCK: Dangerous or irreversible (git push --force, git reset --hard, rm -rf, sudo, curl, wget, nc, ssh, eval, command injection patterns)

Escalation Rules:
- Sensitive paths (.env, .ssh, credentials, *.pem) → escalate +1 level
- Config files (.github/workflows/*, package.json, tsconfig.json, Dockerfile) → L2 minimum
- Command injection (backticks, $(), &&, ||, ;, |) → L3
- Unknown/ambiguous → L2

If you cannot confidently classify, default to L2.`;

// Deterministic patterns — no LLM call needed
const L0_TOOLS = new Set([
  "read_file", "list_dir", "search", "git_status", "git_log", "git_diff",
]);

const L3_COMMANDS = /\b(sudo|rm\s+-rf|curl|wget|nc|ssh|scp|telnet|eval|exec|alias)\b/;
// Catch absolute/relative paths to blocked binaries: /usr/bin/curl, ./curl, etc.
const L3_PATH_COMMANDS = /(?:\/[\w./-]*\/)?(curl|wget|nc|ncat|ssh|scp|telnet)\b/;
// Python/Node/Ruby network access — common evasion for curl/wget
const L3_SCRIPT_NETWORK = /\b(python3?|node|ruby|perl|php)\b.*\b(urllib|requests|http\.get|fetch|Net::HTTP|socket|open-uri|fsockopen|file_get_contents)\b/i;
// Base64 decode piped to shell — obfuscated payload delivery
const L3_BASE64_EXEC = /base64\s+(-d|--decode)|atob\s*\(|Buffer\.from\s*\([^)]*,\s*['"]base64['"]\)/;
// chmod +x followed by execution — download-and-run pattern
const L3_CHMOD_EXEC = /chmod\s+\+x/;
// Process substitution and here-string tricks
const L3_PROC_SUBST = /<\(|>\(|<<<\s*\$/;

const INJECTION_PATTERN = /[`]|\$\(|&&|\|\||(?<![|]);/;
const SENSITIVE_PATHS = /\.(env|ssh|pem|key|credentials|secret)/i;
const CONFIG_FILES = /\.github\/workflows|package\.json|tsconfig\.json|Dockerfile|\.eslintrc|\.prettierrc/;
const FORCE_PUSH = /git\s+push\s+.*--force/;

export function classifyDeterministic(
  toolName: string,
  args: Record<string, unknown>,
): Classification | null {
  if (L0_TOOLS.has(toolName)) {
    return { level: RiskLevel.L0, reason: "Nur lesen, keine Änderung", deterministic: true };
  }

  const command = typeof args.command === "string" ? args.command : "";
  const path = typeof args.path === "string" ? args.path : "";

  if (L3_COMMANDS.test(command)) {
    return { level: RiskLevel.L3, reason: "Gesperrter Befehl", deterministic: true };
  }

  if (L3_PATH_COMMANDS.test(command)) {
    return { level: RiskLevel.L3, reason: "Gesperrter Befehl (Pfad-Variante)", deterministic: true };
  }

  if (L3_SCRIPT_NETWORK.test(command)) {
    return { level: RiskLevel.L3, reason: "Netzwerkzugriff via Script-Sprache", deterministic: true };
  }

  if (L3_BASE64_EXEC.test(command)) {
    return { level: RiskLevel.L3, reason: "Base64-Decode erkannt — mögliche Payload", deterministic: true };
  }

  if (L3_CHMOD_EXEC.test(command)) {
    return { level: RiskLevel.L3, reason: "Ausführbar machen — Download-and-Run Muster", deterministic: true };
  }

  if (L3_PROC_SUBST.test(command)) {
    return { level: RiskLevel.L3, reason: "Prozess-Substitution erkannt", deterministic: true };
  }

  if (INJECTION_PATTERN.test(command)) {
    return { level: RiskLevel.L3, reason: "Injection-Muster erkannt", deterministic: true };
  }

  if (FORCE_PUSH.test(command)) {
    return { level: RiskLevel.L3, reason: "Force-Push überschreibt Remote irreversibel", deterministic: true };
  }

  if (SENSITIVE_PATHS.test(path) || SENSITIVE_PATHS.test(command)) {
    return { level: RiskLevel.L3, reason: "Zugriff auf sensible Datei", deterministic: true };
  }

  if (CONFIG_FILES.test(path) || CONFIG_FILES.test(command)) {
    return { level: RiskLevel.L2, reason: "Config-Datei — Genehmigung erforderlich", deterministic: true };
  }

  return null;
}

const JSON_EXTRACT = /\{[^{}]*"level"\s*:\s*"L[0-3]"[^{}]*\}/;

export function tryParseClassification(text: string): { level: RiskLevel; reason: string } | null {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(text);
    if (VALID_LEVELS.has(parsed.level)) {
      return { level: parsed.level, reason: parsed.reason ?? "Keine Begründung" };
    }
  } catch { /* fall through to regex extraction */ }

  // LLMs sometimes wrap JSON in markdown or thinking tags — extract it
  const match = JSON_EXTRACT.exec(text);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (VALID_LEVELS.has(parsed.level)) {
        return { level: parsed.level, reason: parsed.reason ?? "Keine Begründung" };
      }
    } catch { /* give up */ }
  }

  return null;
}

const MAX_LLM_RETRIES = 2;

export async function classifyWithLlm(
  toolName: string,
  args: Record<string, unknown>,
  config: Config,
): Promise<Classification> {
  const ollama = createOllama({ baseURL: config.ollama.baseUrl });
  const prompt = `Classify: tool=${toolName}, args=${JSON.stringify(args)}`;

  for (let attempt = 0; attempt < MAX_LLM_RETRIES; attempt++) {
    try {
      const result = await generateText({
        model: ollama(config.ollama.model),
        system: RISK_CLASSIFIER_PROMPT,
        prompt: attempt === 0
          ? prompt
          : `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON, no other text.`,
      });

      const parsed = tryParseClassification(result.text);
      if (parsed) {
        return { level: parsed.level, reason: parsed.reason, deterministic: false };
      }

      console.warn(`LLM risk classifier returned unparseable response (attempt ${attempt + 1}): ${result.text.slice(0, 100)}`);
    } catch (err) {
      console.warn(`LLM risk classifier error (attempt ${attempt + 1}):`, err);
    }
  }

  return { level: RiskLevel.L2, reason: "LLM-Klassifikation fehlgeschlagen — Fallback L2", deterministic: false };
}

export async function classifyRisk(
  toolName: string,
  args: Record<string, unknown>,
  config: Config,
): Promise<Classification> {
  const deterministic = classifyDeterministic(toolName, args);
  if (deterministic) return deterministic;
  return classifyWithLlm(toolName, args, config);
}
