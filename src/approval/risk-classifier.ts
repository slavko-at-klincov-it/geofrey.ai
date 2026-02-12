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

// Deterministic patterns — no LLM call needed
const L0_TOOLS = new Set([
  "read_file", "list_dir", "search", "git_status", "git_log", "git_diff",
]);

const L3_COMMANDS = /\b(sudo|rm\s+-rf|curl|wget|nc|ssh|scp|telnet|eval|exec|alias)\b/;
const INJECTION_PATTERN = /[`]|\$\(|&&|\|\||(?<![|]);/;
const SENSITIVE_PATHS = /\.(env|ssh|pem|key|credentials|secret)/i;
const CONFIG_FILES = /\.(github\/workflows|package\.json|tsconfig\.json|Dockerfile|\.eslintrc|\.prettierrc)/;
const FORCE_PUSH = /git\s+push\s+.*--force/;

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

export function classifyDeterministic(
  toolName: string,
  args: Record<string, unknown>,
): Classification | null {
  // L0: read-only tools
  if (L0_TOOLS.has(toolName)) {
    return { level: RiskLevel.L0, reason: "Nur lesen, keine Änderung", deterministic: true };
  }

  const command = typeof args.command === "string" ? args.command : "";
  const path = typeof args.path === "string" ? args.path : "";

  // L3: banned commands
  if (L3_COMMANDS.test(command)) {
    return { level: RiskLevel.L3, reason: "Gesperrter Befehl", deterministic: true };
  }

  // L3: injection patterns
  if (INJECTION_PATTERN.test(command)) {
    return { level: RiskLevel.L3, reason: "Injection-Muster erkannt", deterministic: true };
  }

  // L3: force push
  if (FORCE_PUSH.test(command)) {
    return { level: RiskLevel.L3, reason: "Force-Push überschreibt Remote irreversibel", deterministic: true };
  }

  // Escalation: sensitive paths
  if (SENSITIVE_PATHS.test(path) || SENSITIVE_PATHS.test(command)) {
    return { level: RiskLevel.L3, reason: "Zugriff auf sensible Datei", deterministic: true };
  }

  // Escalation: config files → L2 minimum
  if (CONFIG_FILES.test(path) || CONFIG_FILES.test(command)) {
    return { level: RiskLevel.L2, reason: "Config-Datei — Genehmigung erforderlich", deterministic: true };
  }

  // Not deterministically classifiable — needs LLM
  return null;
}

export async function classifyWithLlm(
  toolName: string,
  args: Record<string, unknown>,
  config: Config,
): Promise<Classification> {
  try {
    const ollama = createOllama({ baseURL: config.ollama.baseUrl });

    const result = await generateText({
      model: ollama(config.ollama.model),
      system: RISK_CLASSIFIER_PROMPT,
      prompt: `Classify: tool=${toolName}, args=${JSON.stringify(args)}`,
    });

    const parsed = JSON.parse(result.text);
    const level = parsed.level as string;
    const reason = parsed.reason as string;

    // Validate level is one of L0/L1/L2/L3
    if (!["L0", "L1", "L2", "L3"].includes(level)) {
      return { level: RiskLevel.L2, reason: "Ungültige Klassifikation — Fallback L2", deterministic: false };
    }

    return { level: level as RiskLevel, reason, deterministic: false };
  } catch (error) {
    // Fallback to L2 on any error (JSON parse, network, etc.)
    return { level: RiskLevel.L2, reason: "LLM-Klassifikation fehlgeschlagen — Fallback L2", deterministic: false };
  }
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
