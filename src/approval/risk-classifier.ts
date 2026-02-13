import { generateText } from "ai";
import { createOllama } from "ai-sdk-ollama";
import type { Config } from "../config/schema.js";
import { t } from "../i18n/index.js";

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

export function buildRiskClassifierPrompt(): string {
  const language = t("approval.classifierLanguage");
  return `You are a security risk classifier for an AI agent system. Your ONLY job is to classify tool/command requests into risk levels.

ALWAYS respond with exactly this XML structure, nothing else:
<classification><level>L0|L1|L2|L3</level><reason>one-line explanation in ${language}</reason></classification>

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
}

// Deterministic patterns — no LLM call needed
const L0_TOOLS = new Set([
  "read_file", "list_dir", "search", "git_status", "git_log", "git_diff", "project_map",
  "web_search", "web_fetch",
  "memory_read", "memory_search",
  "process_manager:list", "process_manager:check", "process_manager:logs",
  "agent_list",
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

// Injection patterns for single commands (backticks, $() only — operators handled by decomposition)
const SINGLE_CMD_INJECTION = /[`]|\$\(/;
const SENSITIVE_PATHS = /\.(env|ssh|pem|key|credentials|secret)/i;
const CONFIG_FILES = /\.github\/workflows|package\.json|tsconfig\.json|Dockerfile|\.eslintrc|\.prettierrc/;
const FORCE_PUSH = /git\s+push\s+.*--force/;
// Bare shell interpreters — dangerous as pipe targets
const L3_BARE_SHELL = /^\s*(sh|bash|zsh|dash|ksh|cmd(\.exe)?|powershell(\.exe)?|pwsh(\.exe)?)\b/;

export function riskOrdinal(level: RiskLevel): number {
  switch (level) {
    case RiskLevel.L0: return 0;
    case RiskLevel.L1: return 1;
    case RiskLevel.L2: return 2;
    case RiskLevel.L3: return 3;
  }
}

/**
 * Split a command string on unquoted `&&`, `||`, `;`, `|`, and `\n`,
 * respecting single/double quotes and backslash escaping.
 */
export function decomposeCommand(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\" && !inSingle) {
      escaped = true;
      current += ch;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (ch === "&" && command[i + 1] === "&") {
        segments.push(current);
        current = "";
        i++;
        continue;
      }
      if (ch === "|" && command[i + 1] === "|") {
        segments.push(current);
        current = "";
        i++;
        continue;
      }
      if (ch === "|") {
        segments.push(current);
        current = "";
        continue;
      }
      if (ch === ";" || ch === "\n") {
        segments.push(current);
        current = "";
        continue;
      }
    }

    current += ch;
  }

  if (current.trim()) {
    segments.push(current);
  }

  return segments.map(s => s.trim()).filter(s => s.length > 0);
}

export function classifySingleCommand(command: string): Classification | null {
  if (L3_COMMANDS.test(command)) {
    return { level: RiskLevel.L3, reason: t("approval.blockedCommand"), deterministic: true };
  }

  if (L3_PATH_COMMANDS.test(command)) {
    return { level: RiskLevel.L3, reason: t("approval.blockedCommandPath"), deterministic: true };
  }

  if (L3_SCRIPT_NETWORK.test(command)) {
    return { level: RiskLevel.L3, reason: t("approval.scriptNetwork"), deterministic: true };
  }

  if (L3_BASE64_EXEC.test(command)) {
    return { level: RiskLevel.L3, reason: t("approval.base64Decode"), deterministic: true };
  }

  if (L3_CHMOD_EXEC.test(command)) {
    return { level: RiskLevel.L3, reason: t("approval.chmodExec"), deterministic: true };
  }

  if (L3_PROC_SUBST.test(command)) {
    return { level: RiskLevel.L3, reason: t("approval.procSubstitution"), deterministic: true };
  }

  if (SINGLE_CMD_INJECTION.test(command)) {
    return { level: RiskLevel.L3, reason: t("approval.injectionPattern"), deterministic: true };
  }

  if (FORCE_PUSH.test(command)) {
    return { level: RiskLevel.L3, reason: t("approval.forcePush"), deterministic: true };
  }

  if (L3_BARE_SHELL.test(command)) {
    return { level: RiskLevel.L3, reason: t("approval.bareShell"), deterministic: true };
  }

  if (SENSITIVE_PATHS.test(command)) {
    return { level: RiskLevel.L3, reason: t("approval.sensitivePath"), deterministic: true };
  }

  if (CONFIG_FILES.test(command)) {
    return { level: RiskLevel.L2, reason: t("approval.configFile"), deterministic: true };
  }

  return null;
}

export function classifyDeterministic(
  toolName: string,
  args: Record<string, unknown>,
): Classification | null {
  // Handle action-based tools (process_manager, webhook)
  const action = typeof args.action === "string" ? args.action : "";
  if (toolName === "process_manager") {
    if (action === "list" || action === "check" || action === "logs") {
      return { level: RiskLevel.L0, reason: t("approval.readOnly"), deterministic: true };
    }
    if (action === "spawn") {
      // Check the command against L3 patterns before allowing as L2
      const spawnCmd = typeof args.command === "string" ? args.command : "";
      if (spawnCmd) {
        const segments = decomposeCommand(spawnCmd);
        for (const segment of segments) {
          const result = classifySingleCommand(segment);
          if (result && result.level === RiskLevel.L3) return result;
        }
      }
      return { level: RiskLevel.L2, reason: "Spawns background process", deterministic: true };
    }
    if (action === "kill") {
      return { level: RiskLevel.L2, reason: "Terminates background process", deterministic: true };
    }
  }
  if (toolName === "webhook") {
    if (action === "list" || action === "test") {
      return { level: RiskLevel.L0, reason: t("approval.readOnly"), deterministic: true };
    }
    if (action === "create") {
      return { level: RiskLevel.L1, reason: "Creates webhook endpoint", deterministic: true };
    }
    if (action === "delete") {
      return { level: RiskLevel.L2, reason: "Deletes webhook endpoint", deterministic: true };
    }
  }
  if (toolName === "agent_send") {
    return { level: RiskLevel.L1, reason: "Inter-agent communication", deterministic: true };
  }
  if (toolName === "agent_history") {
    return { level: RiskLevel.L0, reason: t("approval.readOnly"), deterministic: true };
  }

  // Tool-specific deterministic rules
  if (toolName === "write_file") {
    const writePath = typeof args.path === "string" ? args.path : "";
    if (SENSITIVE_PATHS.test(writePath)) {
      return { level: RiskLevel.L3, reason: t("approval.sensitivePath"), deterministic: true };
    }
    if (CONFIG_FILES.test(writePath)) {
      return { level: RiskLevel.L2, reason: t("approval.configFile"), deterministic: true };
    }
    return { level: RiskLevel.L1, reason: "Safe write in project dir", deterministic: true };
  }
  if (toolName === "delete_file") {
    return { level: RiskLevel.L2, reason: "File deletion is hard to reverse", deterministic: true };
  }
  if (toolName === "git_commit") {
    return { level: RiskLevel.L2, reason: "Creates a git commit", deterministic: true };
  }
  if (toolName === "claude_code") {
    return { level: RiskLevel.L1, reason: "Bounded by tool profiles", deterministic: true };
  }
  if (toolName === "memory_write") {
    return { level: RiskLevel.L1, reason: "Reversible memory write", deterministic: true };
  }
  if (toolName === "cron" && action === "create") {
    return { level: RiskLevel.L1, reason: "Schedules a cron job", deterministic: true };
  }
  if (toolName === "cron" && (action === "list")) {
    return { level: RiskLevel.L0, reason: "Read-only cron list", deterministic: true };
  }
  if (toolName === "cron" && action === "delete") {
    return { level: RiskLevel.L2, reason: "Deletes a scheduled job", deterministic: true };
  }
  if (toolName === "browser") {
    if (action === "evaluate") {
      // Scan for network API calls — escalate to L3
      const expression = typeof args.expression === "string" ? args.expression : "";
      if (/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bnavigator\.sendBeacon\b/.test(expression)) {
        return { level: RiskLevel.L3, reason: "Network API in browser evaluate", deterministic: true };
      }
      return { level: RiskLevel.L2, reason: "Arbitrary JS execution", deterministic: true };
    }
  }
  if (toolName === "skill" && action === "install") {
    return { level: RiskLevel.L2, reason: "Installs external code", deterministic: true };
  }
  if (toolName === "skill" && (action === "list" || action === "enable" || action === "disable")) {
    return { level: RiskLevel.L0, reason: "Read-only skill management", deterministic: true };
  }
  if (toolName === "skill" && action === "generate") {
    return { level: RiskLevel.L1, reason: "Generates skill file", deterministic: true };
  }

  // TTS
  if (toolName === "tts_speak") {
    return { level: RiskLevel.L1, reason: "Speech synthesis", deterministic: true };
  }

  // Companion
  if (toolName === "companion") {
    if (action === "list") {
      return { level: RiskLevel.L0, reason: t("approval.readOnly"), deterministic: true };
    }
    if (action === "pair" || action === "push_notification") {
      return { level: RiskLevel.L1, reason: "Companion device interaction", deterministic: true };
    }
    if (action === "unpair") {
      return { level: RiskLevel.L2, reason: "Removes paired device", deterministic: true };
    }
  }

  // Smart Home
  if (toolName === "smart_home") {
    if (action === "discover" || action === "list") {
      return { level: RiskLevel.L0, reason: t("approval.readOnly"), deterministic: true };
    }
    if (action === "control" || action === "scene") {
      return { level: RiskLevel.L2, reason: "Controls physical device", deterministic: true };
    }
  }

  // Gmail
  if (toolName === "gmail") {
    if (action === "list" || action === "read") {
      return { level: RiskLevel.L0, reason: t("approval.readOnly"), deterministic: true };
    }
    if (action === "auth" || action === "label") {
      return { level: RiskLevel.L1, reason: "Gmail auth/label", deterministic: true };
    }
    if (action === "send" || action === "delete") {
      return { level: RiskLevel.L2, reason: "Sends or deletes email", deterministic: true };
    }
  }

  // Calendar
  if (toolName === "calendar") {
    if (action === "list" || action === "get" || action === "calendars") {
      return { level: RiskLevel.L0, reason: t("approval.readOnly"), deterministic: true };
    }
    if (action === "auth") {
      return { level: RiskLevel.L1, reason: "Calendar auth", deterministic: true };
    }
    if (action === "create" || action === "update" || action === "delete") {
      return { level: RiskLevel.L2, reason: "Modifies calendar event", deterministic: true };
    }
  }

  if (L0_TOOLS.has(toolName)) {
    return { level: RiskLevel.L0, reason: t("approval.readOnly"), deterministic: true };
  }

  const command = typeof args.command === "string" ? args.command : "";
  const path = typeof args.path === "string" ? args.path : "";

  // Decompose command into segments and classify each — return highest risk
  if (command) {
    const segments = decomposeCommand(command);
    let highest: Classification | null = null;

    for (const segment of segments) {
      const result = classifySingleCommand(segment);
      if (result) {
        if (result.level === RiskLevel.L3) return result; // short-circuit
        if (!highest || riskOrdinal(result.level) > riskOrdinal(highest.level)) {
          highest = result;
        }
      }
    }

    if (highest) return highest;
  }

  // Path-based checks (not command-based)
  if (SENSITIVE_PATHS.test(path)) {
    return { level: RiskLevel.L3, reason: t("approval.sensitivePath"), deterministic: true };
  }

  if (CONFIG_FILES.test(path)) {
    return { level: RiskLevel.L2, reason: t("approval.configFile"), deterministic: true };
  }

  return null;
}

const XML_LEVEL = /<level>\s*(L[0-3])\s*<\/level>/;
const XML_REASON = /<reason>([\s\S]*?)<\/reason>/;

export function tryParseXmlClassification(text: string): { level: RiskLevel; reason: string } | null {
  const levelMatch = XML_LEVEL.exec(text);
  if (!levelMatch) return null;
  const level = levelMatch[1] as RiskLevel;
  if (!VALID_LEVELS.has(level)) return null;
  const reasonMatch = XML_REASON.exec(text);
  const reason = reasonMatch ? reasonMatch[1].trim() : t("approval.noReason");
  return { level, reason };
}

const JSON_EXTRACT = /\{[^{}]*"level"\s*:\s*"L[0-3]"[^{}]*\}/;

export function tryParseClassification(text: string): { level: RiskLevel; reason: string } | null {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(text);
    if (VALID_LEVELS.has(parsed.level)) {
      return { level: parsed.level, reason: parsed.reason ?? t("approval.noReason") };
    }
  } catch { /* fall through to regex extraction */ }

  // LLMs sometimes wrap JSON in markdown or thinking tags — extract it
  const match = JSON_EXTRACT.exec(text);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (VALID_LEVELS.has(parsed.level)) {
        return { level: parsed.level, reason: parsed.reason ?? t("approval.noReason") };
      }
    } catch { /* give up */ }
  }

  return null;
}

const MAX_LLM_RETRIES = 2;

const SENSITIVE_ARG_KEYS = new Set([
  "secret", "token", "pushToken", "apiKey", "password", "code",
  "accessToken", "refreshToken", "botToken", "appToken", "clientSecret",
]);

export function scrubArgsForLlm(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    result[key] = SENSITIVE_ARG_KEYS.has(key) ? "[REDACTED]" : value;
  }
  return result;
}

export async function classifyWithLlm(
  toolName: string,
  args: Record<string, unknown>,
  config: Config,
): Promise<Classification> {
  const ollama = createOllama({ baseURL: config.ollama.baseUrl });
  const prompt = `Classify: tool=${toolName}, args=${JSON.stringify(scrubArgsForLlm(args))}`;

  for (let attempt = 0; attempt < MAX_LLM_RETRIES; attempt++) {
    try {
      const result = await generateText({
        model: ollama(config.ollama.model),
        system: buildRiskClassifierPrompt(),
        prompt: attempt === 0
          ? prompt
          : `${prompt}\n\nIMPORTANT: Respond with ONLY the XML classification tags, no other text.`,
      });

      // Try XML first (preferred for Qwen3), fall back to JSON
      const parsed = tryParseXmlClassification(result.text) ?? tryParseClassification(result.text);
      if (parsed) {
        return { level: parsed.level, reason: parsed.reason, deterministic: false };
      }

      console.warn(`LLM risk classifier returned unparseable response (attempt ${attempt + 1}): ${result.text.slice(0, 100)}`);
    } catch (err) {
      console.warn(`LLM risk classifier error (attempt ${attempt + 1}):`, err);
    }
  }

  return { level: RiskLevel.L2, reason: t("approval.llmFallback"), deterministic: false };
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
