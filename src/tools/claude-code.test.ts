import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildClaudeArgs,
  parseStreamJson,
  initClaudeCode,
  getAndClearLastResult,
  type StreamEvent,
} from "./claude-code.js";
import type { Config } from "../config/schema.js";

describe("buildClaudeArgs", () => {
  const baseConfig: Config["claude"] = {
    enabled: true,
    skipPermissions: true,
    outputFormat: "stream-json",
    model: "claude-sonnet-4-5-20250929",
    sessionTtlMs: 3_600_000,
    timeoutMs: 600_000,
    defaultDirs: [],
    toolProfiles: {
      readOnly: "Read Glob Grep",
      standard: "Read Glob Grep Edit Write Bash(git:*)",
      full: "Read Glob Grep Edit Write Bash",
    },
  };

  it("builds minimal args with --print and --output-format", () => {
    const args = buildClaudeArgs({ prompt: "Hello", config: baseConfig });
    assert.ok(args.includes("--print"));
    assert.ok(args.includes("--output-format"));
    assert.ok(args.includes("stream-json"));
    assert.equal(args[args.length - 1], "Hello");
  });

  it("includes --dangerously-skip-permissions when skipPermissions=true", () => {
    const args = buildClaudeArgs({ prompt: "test", config: baseConfig });
    assert.ok(args.includes("--dangerously-skip-permissions"));
  });

  it("omits --dangerously-skip-permissions when skipPermissions=false", () => {
    const args = buildClaudeArgs({ prompt: "test", config: { ...baseConfig, skipPermissions: false } });
    assert.ok(!args.includes("--dangerously-skip-permissions"));
  });

  it("includes --model when set", () => {
    const args = buildClaudeArgs({ prompt: "test", config: baseConfig });
    const modelIdx = args.indexOf("--model");
    assert.ok(modelIdx >= 0);
    assert.equal(args[modelIdx + 1], "claude-sonnet-4-5-20250929");
  });

  it("includes --session-id when provided", () => {
    const args = buildClaudeArgs({ prompt: "test", config: baseConfig, sessionId: "sess-123" });
    const idx = args.indexOf("--session-id");
    assert.ok(idx >= 0);
    assert.equal(args[idx + 1], "sess-123");
  });

  it("includes --allowedTools when provided", () => {
    const args = buildClaudeArgs({ prompt: "test", config: baseConfig, allowedTools: "Read Glob" });
    const idx = args.indexOf("--allowedTools");
    assert.ok(idx >= 0);
    assert.equal(args[idx + 1], "Read Glob");
  });

  it("includes --append-system-prompt when provided", () => {
    const args = buildClaudeArgs({ prompt: "test", config: baseConfig, systemPrompt: "Be concise" });
    const idx = args.indexOf("--append-system-prompt");
    assert.ok(idx >= 0);
    assert.equal(args[idx + 1], "Be concise");
  });

  it("includes --max-budget-usd when set", () => {
    const args = buildClaudeArgs({ prompt: "test", config: { ...baseConfig, maxBudgetUsd: 5.0 } });
    const idx = args.indexOf("--max-budget-usd");
    assert.ok(idx >= 0);
    assert.equal(args[idx + 1], "5");
  });

  it("includes --add-dir for each defaultDir", () => {
    const args = buildClaudeArgs({ prompt: "test", config: { ...baseConfig, defaultDirs: ["/a", "/b"] } });
    const dirIndices = args.reduce<number[]>((acc, v, i) => v === "--add-dir" ? [...acc, i] : acc, []);
    assert.equal(dirIndices.length, 2);
    assert.equal(args[dirIndices[0] + 1], "/a");
    assert.equal(args[dirIndices[1] + 1], "/b");
  });

  it("includes --mcp-config when mcpConfigPath is set", () => {
    const args = buildClaudeArgs({ prompt: "test", config: { ...baseConfig, mcpConfigPath: "/path/mcp.json" } });
    const idx = args.indexOf("--mcp-config");
    assert.ok(idx >= 0);
    assert.equal(args[idx + 1], "/path/mcp.json");
  });

  it("prompt is always the last argument", () => {
    const args = buildClaudeArgs({
      prompt: "Do the thing",
      config: baseConfig,
      allowedTools: "Read",
      sessionId: "s1",
      systemPrompt: "sys",
    });
    assert.equal(args[args.length - 1], "Do the thing");
  });
});

describe("parseStreamJson", () => {
  async function collectEvents(lines: string[]): Promise<StreamEvent[]> {
    async function* gen() {
      for (const line of lines) yield line + "\n";
    }
    const events: StreamEvent[] = [];
    for await (const event of parseStreamJson(gen())) {
      events.push(event);
    }
    return events;
  }

  it("parses assistant text events", async () => {
    const events = await collectEvents([
      JSON.stringify({ type: "assistant", content: "Hello world" }),
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "assistant");
    assert.equal(events[0].content, "Hello world");
  });

  it("parses tool_use events", async () => {
    const events = await collectEvents([
      JSON.stringify({ type: "tool_use", tool: "read_file", input: { path: "test.ts" } }),
    ]);
    assert.equal(events[0].type, "tool_use");
    assert.equal(events[0].toolName, "read_file");
    assert.deepEqual(events[0].toolInput, { path: "test.ts" });
  });

  it("parses tool_result events", async () => {
    const events = await collectEvents([
      JSON.stringify({ type: "tool_result", tool: "read_file", content: "file contents" }),
    ]);
    assert.equal(events[0].type, "tool_result");
    assert.equal(events[0].content, "file contents");
  });

  it("parses result events with metadata", async () => {
    const events = await collectEvents([
      JSON.stringify({ type: "result", content: "Done", cost_usd: 0.05, total_tokens: 1000, model: "claude-sonnet", session_id: "s1" }),
    ]);
    assert.equal(events[0].type, "result");
    assert.equal(events[0].content, "Done");
    assert.equal(events[0].costUsd, 0.05);
    assert.equal(events[0].tokensUsed, 1000);
    assert.equal(events[0].model, "claude-sonnet");
    assert.equal(events[0].sessionId, "s1");
  });

  it("parses error events", async () => {
    const events = await collectEvents([
      JSON.stringify({ type: "error", error: "something failed" }),
    ]);
    assert.equal(events[0].type, "error");
    assert.equal(events[0].content, "something failed");
  });

  it("skips non-JSON lines", async () => {
    const events = await collectEvents([
      "not json",
      JSON.stringify({ type: "assistant", content: "ok" }),
      "also not json",
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].content, "ok");
  });

  it("handles multiple events in stream", async () => {
    const events = await collectEvents([
      JSON.stringify({ type: "assistant", content: "part1" }),
      JSON.stringify({ type: "tool_use", tool: "search", input: { query: "test" } }),
      JSON.stringify({ type: "tool_result", tool: "search", content: "found" }),
      JSON.stringify({ type: "assistant", content: "part2" }),
      JSON.stringify({ type: "result", content: "final" }),
    ]);
    assert.equal(events.length, 5);
    assert.equal(events[0].type, "assistant");
    assert.equal(events[1].type, "tool_use");
    assert.equal(events[4].type, "result");
  });

  it("handles content array (text blocks)", async () => {
    const events = await collectEvents([
      JSON.stringify({
        type: "assistant",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "World" },
        ],
      }),
    ]);
    assert.equal(events[0].content, "Hello World");
  });
});

describe("getAndClearLastResult", () => {
  it("returns null when no result stored", () => {
    // Clear any stale state
    getAndClearLastResult();
    const result = getAndClearLastResult();
    assert.equal(result, null);
  });
});

describe("initClaudeCode", () => {
  it("does not throw", () => {
    assert.doesNotThrow(() => {
      initClaudeCode({
        enabled: false,
        skipPermissions: true,
        outputFormat: "stream-json",
        model: "test",
        sessionTtlMs: 1000,
        timeoutMs: 1000,
        defaultDirs: [],
        toolProfiles: { readOnly: "", standard: "", full: "" },
      });
    });
  });
});
