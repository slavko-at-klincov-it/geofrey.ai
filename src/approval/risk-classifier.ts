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
  _toolName: string,
  _args: Record<string, unknown>,
  _config: Config,
): Promise<Classification> {
  // TODO: Invoke Prompt 1 (Risk Classifier) via Vercel AI SDK
  // Fallback to L2 for safety
  return { level: RiskLevel.L2, reason: "LLM-Klassifikation ausstehend", deterministic: false };
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
