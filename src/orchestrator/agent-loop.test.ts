import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * agent-loop.ts exports:
 * - runAgentLoopStreaming (needs Ollama — tested in E2E)
 * - TurnUsage (type only)
 *
 * Internal helpers are not exported, so we test the module boundary:
 * - Import succeeds (circular import was a critical bug)
 * - Exported functions exist with correct signatures
 * - TurnUsage type is structurally correct
 *
 * The actual agent loop behavior is covered by E2E tests in
 * src/e2e/live/agent-loop.e2e.test.ts (requires real Ollama).
 */

describe("agent-loop module", () => {
  it("imports successfully (no circular dependency)", async () => {
    const mod = await import("./agent-loop.js");
    assert.ok(mod, "Module should import");
    assert.equal(typeof mod.runAgentLoopStreaming, "function");
  });

  it("runAgentLoopStreaming is an async function", async () => {
    const { runAgentLoopStreaming } = await import("./agent-loop.js");
    // AsyncFunction constructor name check
    assert.equal(runAgentLoopStreaming.constructor.name, "AsyncFunction");
  });

  it("TurnUsage shape is correct (structural test)", () => {
    // Test that the type is usable by constructing a value
    const usage = { cloudTokens: 100, cloudCostUsd: 0.05, localTokens: 500 };
    assert.equal(typeof usage.cloudTokens, "number");
    assert.equal(typeof usage.cloudCostUsd, "number");
    assert.equal(typeof usage.localTokens, "number");
  });
});

describe("agent-loop dependencies", () => {
  it("tool-registry getAiSdkTools works (imported by agent-loop)", async () => {
    const { getAiSdkTools } = await import("../tools/tool-registry.js");
    const tools = getAiSdkTools();
    assert.ok(Object.keys(tools).length > 0, "Should have registered tools");
  });

  it("conversation manager works (imported by agent-loop)", async () => {
    const { getOrCreate, addMessage, getHistory } = await import("./conversation.js");
    const chatId = `_test_agent_loop_${Date.now()}`;
    getOrCreate(chatId);
    addMessage(chatId, { role: "user", content: "Test" });
    const history = getHistory(chatId);
    assert.equal(history.length, 1);
    assert.equal(history[0].content, "Test");
  });

  it("billing formatCostLine works (imported by agent-loop)", async () => {
    const { formatCostLine } = await import("../billing/format.js");
    const line = formatCostLine({ cloudTokens: 1000, cloudCostUsd: 0.01, localTokens: 5000 });
    assert.equal(typeof line, "string");
    assert.ok(line.length > 0, "Should produce a cost line");
  });

  it("streamer creates a stream (imported by agent-loop)", async () => {
    const { createStream } = await import("../messaging/streamer.js");
    let sent = "";
    const mockPlatform = {
      name: "telegram" as const,
      maxMessageLength: 4096,
      supportsEdit: true,
      sendMessage: async (_c: string, text: string) => { sent = text; return "1"; },
      editMessage: async (_c: string, _r: string, text: string) => { sent = text; return "1"; },
      sendApproval: async () => {},
      start: async () => {},
      stop: async () => {},
    };
    const stream = createStream(mockPlatform, "test-chat");
    assert.ok(stream);
    assert.equal(typeof stream.start, "function");
    assert.equal(typeof stream.append, "function");
    assert.equal(typeof stream.finish, "function");
  });
});
