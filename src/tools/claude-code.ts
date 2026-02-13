import { execa } from "execa";
import { resolve } from "node:path";
import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import type { Config } from "../config/schema.js";
import { anonymize, wrapStreamCallbacks, buildAnonymizerSystemPrompt, type AnonymizerConfig } from "../anonymizer/anonymizer.js";
import { deanonymize } from "../anonymizer/deanonymizer.js";

// --- Types ---

export interface StreamEvent {
  type: "assistant" | "tool_use" | "tool_result" | "result" | "error" | "system";
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  costUsd?: number;
  tokensUsed?: number;
  model?: string;
  sessionId?: string;
}

export interface ClaudeInvocation {
  prompt: string;
  cwd?: string;
  allowedTools?: string;
  systemPrompt?: string;
  sessionId?: string;
  taskKey?: string;
  onText?: (text: string) => void;
  onToolUse?: (toolName: string, input: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: string) => void;
}

export interface ClaudeResult {
  text: string;
  exitCode: number;
  sessionId?: string;
  costUsd?: number;
  tokensUsed?: number;
  model?: string;
}

interface ClaudeSession {
  sessionId: string;
  createdAt: number;
}

// --- Module state ---

let claudeConfig: Config["claude"] | null = null;
let anonymizerConfig: AnonymizerConfig | null = null;
const sessions = new Map<string, ClaudeSession>();

// Last invoke result for audit enrichment (read by agent-loop onStepFinish)
let lastInvokeResult: ClaudeResult | null = null;

export function getAndClearLastResult(): ClaudeResult | null {
  const r = lastInvokeResult;
  lastInvokeResult = null;
  return r;
}

// Streaming callbacks set by agent-loop for live platform updates
let activeStreamCallbacks: Pick<ClaudeInvocation, 'onText' | 'onToolUse' | 'onToolResult'> | null = null;

export function setStreamCallbacks(cb: typeof activeStreamCallbacks): void {
  activeStreamCallbacks = cb;
}

export function clearStreamCallbacks(): void {
  activeStreamCallbacks = null;
}

const TOKEN_LIMIT_PATTERN = /output.token.limit.exceeded|exceeded the \d+ output token maximum/i;
const CONCISE_SUFFIX =
  "\n\nIMPORTANT: Be concise. Limit your response length. Summarize where possible.";

// --- Init ---

export function initClaudeCode(config: Config["claude"]): void {
  claudeConfig = config;
}

export function setAnonymizerConfig(config: AnonymizerConfig): void {
  anonymizerConfig = config;
}

// --- Args builder ---

export function buildClaudeArgs(options: {
  prompt: string;
  config: Config["claude"];
  allowedTools?: string;
  systemPrompt?: string;
  sessionId?: string;
}): string[] {
  const { prompt, config, allowedTools, systemPrompt, sessionId } = options;
  const args: string[] = ["--print", "--output-format", config.outputFormat];

  if (config.skipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  if (config.maxBudgetUsd !== undefined) {
    args.push("--max-budget-usd", String(config.maxBudgetUsd));
  }

  if (config.model) {
    args.push("--model", config.model);
  }

  if (sessionId) {
    args.push("--session-id", sessionId);
  }

  if (allowedTools) {
    args.push("--allowedTools", allowedTools);
  }

  if (systemPrompt) {
    args.push("--append-system-prompt", systemPrompt);
  }

  for (const dir of config.defaultDirs) {
    args.push("--add-dir", dir);
  }

  if (config.mcpConfigPath) {
    args.push("--mcp-config", config.mcpConfigPath);
  }

  args.push(prompt);
  return args;
}

// --- Stream JSON parser ---

export async function* parseStreamJson(
  stream: AsyncIterable<string>,
): AsyncGenerator<StreamEvent> {
  let buffer = "";

  for await (const chunk of stream) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed);
        yield normalizeEvent(event);
      } catch {
        // Skip non-JSON lines (e.g. progress indicators)
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim());
      yield normalizeEvent(event);
    } catch {
      // ignore
    }
  }
}

function normalizeEvent(raw: Record<string, unknown>): StreamEvent {
  const type = (raw.type as string) ?? "system";

  if (type === "assistant" || type === "text") {
    return {
      type: "assistant",
      content: extractText(raw),
    };
  }

  if (type === "tool_use") {
    return {
      type: "tool_use",
      toolName: (raw.tool ?? raw.name) as string,
      toolInput: (raw.input ?? raw.args ?? {}) as Record<string, unknown>,
    };
  }

  if (type === "tool_result") {
    return {
      type: "tool_result",
      toolName: (raw.tool ?? raw.name) as string,
      content: typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content),
    };
  }

  if (type === "result") {
    return {
      type: "result",
      content: extractText(raw),
      costUsd: raw.cost_usd as number | undefined,
      tokensUsed: raw.total_tokens as number | undefined,
      model: raw.model as string | undefined,
      sessionId: raw.session_id as string | undefined,
    };
  }

  if (type === "error") {
    return { type: "error", content: raw.error as string ?? raw.message as string ?? "Unknown error" };
  }

  return { type: "system", content: JSON.stringify(raw) };
}

function extractText(raw: Record<string, unknown>): string {
  if (typeof raw.content === "string") return raw.content;
  if (typeof raw.text === "string") return raw.text;
  if (typeof raw.result === "string") return raw.result;
  if (Array.isArray(raw.content)) {
    return raw.content
      .filter((b: unknown) => typeof b === "object" && b !== null && (b as Record<string, unknown>).type === "text")
      .map((b: unknown) => (b as Record<string, string>).text)
      .join("");
  }
  return "";
}

// --- Session management ---

function getSession(taskKey: string, ttlMs: number): string | undefined {
  const session = sessions.get(taskKey);
  if (!session) return undefined;
  if (Date.now() - session.createdAt > ttlMs) {
    sessions.delete(taskKey);
    return undefined;
  }
  return session.sessionId;
}

function setSession(taskKey: string, sessionId: string): void {
  sessions.set(taskKey, { sessionId, createdAt: Date.now() });
}

// --- Main invocation ---

function isTokenLimitError(stderr: string, stdout: string): boolean {
  return TOKEN_LIMIT_PATTERN.test(stderr) || TOKEN_LIMIT_PATTERN.test(stdout);
}

export async function invokeClaudeCode(
  invocation: ClaudeInvocation,
  config?: Config["claude"],
): Promise<ClaudeResult> {
  const cfg = config ?? claudeConfig;
  if (!cfg) throw new Error("Claude Code not initialized — call initClaudeCode(config) first");

  if (!cfg.enabled) {
    return { text: "Claude Code ist deaktiviert.", exitCode: 1 };
  }

  const sessionId = invocation.sessionId
    ?? (invocation.taskKey ? getSession(invocation.taskKey, cfg.sessionTtlMs) : undefined);

  const args = buildClaudeArgs({
    prompt: invocation.prompt,
    config: cfg,
    allowedTools: invocation.allowedTools,
    systemPrompt: invocation.systemPrompt,
    sessionId,
  });

  const result = await runClaudeProcess(args, invocation, cfg);

  // Retry on token limit
  if (result.exitCode !== 0 && isTokenLimitError(result.stderr, result.stdout)) {
    const retryArgs = buildClaudeArgs({
      prompt: invocation.prompt + CONCISE_SUFFIX,
      config: cfg,
      allowedTools: invocation.allowedTools,
      systemPrompt: invocation.systemPrompt,
      sessionId,
    });
    const retry = await runClaudeProcess(retryArgs, invocation, cfg);
    if (retry.exitCode === 0) return retry;
    return { ...retry, text: `Claude Code error: output token limit exceeded after retry. ${retry.stderr}` };
  }

  return result;
}

interface ProcessResult extends ClaudeResult {
  stderr: string;
  stdout: string;
}

async function runClaudeProcess(
  args: string[],
  invocation: ClaudeInvocation,
  cfg: Config["claude"],
): Promise<ProcessResult> {
  const proc = execa("claude", args, {
    cwd: invocation.cwd,
    timeout: cfg.timeoutMs,
    reject: false,
    env: {
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: "64000",
      ...(cfg.apiKey ? { ANTHROPIC_API_KEY: cfg.apiKey } : {}),
    },
  });

  let resultText = "";
  let resultSessionId: string | undefined;
  let resultCost: number | undefined;
  let resultTokens: number | undefined;
  let resultModel: string | undefined;

  if (cfg.outputFormat === "stream-json" && proc.stdout) {
    // For execa, stdout is a readable stream we can iterate
    const chunks: string[] = [];
    proc.stdout.on?.("data", (data: Buffer) => {
      chunks.push(data.toString());
    });

    // Wait for process to complete
    const result = await proc;

    // Parse NDJSON from collected output
    const fullOutput = result.stdout;
    if (fullOutput) {
      for (const line of fullOutput.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = normalizeEvent(JSON.parse(trimmed));
          switch (event.type) {
            case "assistant":
              if (event.content) {
                resultText += event.content;
                invocation.onText?.(event.content);
              }
              break;
            case "tool_use":
              if (event.toolName) {
                invocation.onToolUse?.(event.toolName, event.toolInput ?? {});
              }
              break;
            case "tool_result":
              if (event.toolName) {
                invocation.onToolResult?.(event.toolName, event.content ?? "");
              }
              break;
            case "result":
              if (event.content) resultText = event.content;
              resultSessionId = event.sessionId;
              resultCost = event.costUsd;
              resultTokens = event.tokensUsed;
              resultModel = event.model;
              break;
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }

    if (resultSessionId && invocation.taskKey) {
      setSession(invocation.taskKey, resultSessionId);
    }

    return {
      text: resultText || "(no output)",
      exitCode: result.exitCode ?? 1,
      sessionId: resultSessionId,
      costUsd: resultCost,
      tokensUsed: resultTokens,
      model: resultModel,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  }

  // Non-streaming: json or text format
  const result = await proc;
  const text = parseOutput(result.stdout, cfg.outputFormat);

  return {
    text: text || "(no output)",
    exitCode: result.exitCode ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function parseOutput(stdout: string, format: string): string {
  if (format === "text") return stdout;
  try {
    const parsed = JSON.parse(stdout);
    return parsed.result ?? parsed.text ?? parsed.content ?? stdout;
  } catch {
    return stdout;
  }
}

// --- Tool registration ---

registerTool({
  name: "claude_code",
  description: "Run a coding task via Claude Code CLI — use for multi-file changes, bug fixes, refactoring, features",
  parameters: z.object({
    prompt: z.string().describe("Detailed task description for Claude Code"),
    cwd: z.string().optional().describe("Working directory"),
    allowedTools: z.string().optional().describe("Space-separated tool names to allow"),
    taskKey: z.string().optional().describe("Key for session reuse across turns"),
  }),
  source: "native",
  execute: async ({ prompt, cwd, allowedTools, taskKey }) => {
    // Confine cwd to project root
    let safeCwd = cwd;
    if (safeCwd) {
      const resolved = resolve(safeCwd);
      const root = process.cwd();
      if (!resolved.startsWith(root + "/") && resolved !== root) {
        return `Error: Directory "${cwd}" is outside the project root`;
      }
      safeCwd = resolved;
    }

    // Anonymize prompt if enabled
    const anonConfig = anonymizerConfig ?? { enabled: false, llmPass: false, customTerms: [], skipCategories: [] };
    const { text: anonPrompt, table } = await anonymize(prompt, anonConfig);

    // Wrap stream callbacks for live de-anonymization
    const callbacks = activeStreamCallbacks ?? {};
    const wrappedCallbacks = wrapStreamCallbacks(callbacks, table);

    // Build system prompt appendix for anonymized placeholders
    const anonSystemPrompt = buildAnonymizerSystemPrompt(table);

    const effectiveTools = allowedTools ?? claudeConfig?.toolProfiles?.standard;
    const result = await invokeClaudeCode({
      prompt: anonPrompt,
      cwd: safeCwd,
      allowedTools: effectiveTools,
      taskKey,
      systemPrompt: anonSystemPrompt,
      ...wrappedCallbacks,
    });
    lastInvokeResult = result;

    // De-anonymize final result text
    const resultText = deanonymize(result.text, table);

    if (result.exitCode === 0) {
      return resultText;
    }
    return `Claude Code error (${result.exitCode}): ${resultText}`;
  },
});
