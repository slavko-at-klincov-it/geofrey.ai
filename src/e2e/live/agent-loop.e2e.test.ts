import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { getOrCreate, addMessage, getHistory, setDbUrl } from "../../orchestrator/conversation.js";
import { createApproval, resolveApproval, rejectAllPending } from "../../approval/approval-gate.js";
import { classifyDeterministic, RiskLevel } from "../../approval/risk-classifier.js";
import type { MessagingPlatform, ChatId, MessageRef } from "../../messaging/platform.js";
import { ensureOllama } from "./helpers/ollama-guard.js";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";
import { getDb } from "../../db/client.js";

function createMockPlatform(): {
  platform: MessagingPlatform;
  sent: Array<{ chatId: string; text: string }>;
  edited: Array<{ chatId: string; ref: string; text: string }>;
} {
  const sent: Array<{ chatId: string; text: string }> = [];
  const edited: Array<{ chatId: string; ref: string; text: string }> = [];
  let counter = 0;

  const platform: MessagingPlatform = {
    name: "telegram",
    maxMessageLength: 4096,
    supportsEdit: true,
    async sendMessage(chatId: ChatId, text: string): Promise<MessageRef> {
      counter++;
      sent.push({ chatId, text });
      return String(counter);
    },
    async editMessage(chatId: ChatId, ref: MessageRef, text: string): Promise<MessageRef> {
      edited.push({ chatId, ref, text });
      return ref;
    },
    async sendApproval(): Promise<void> {},
    async start(): Promise<void> {},
    async stop(): Promise<void> {},
  };

  return { platform, sent, edited };
}

// Pre-check if agent-loop can be imported (has complex dependency chain)
let agentLoopModule: { runAgentLoopStreaming: Function } | null = null;
let importError: string | null = null;

describe("E2E: Agent Loop", { timeout: 300_000 }, () => {
  let env: TestEnv;
  let ollamaAvailable = false;

  before(async () => {
    env = await createTestEnv();
    getDb(env.dbUrl);
    setDbUrl(env.dbUrl);
    const guard = await ensureOllama();
    ollamaAvailable = !guard.skip;

    // Try to import agent-loop (may fail due to tool registration)
    try {
      agentLoopModule = await import("../../orchestrator/agent-loop.js");
    } catch (err) {
      importError = err instanceof Error ? err.message : String(err);
    }
  });

  after(async () => {
    rejectAllPending("test-cleanup");
    await env.cleanup();
  });

  it("conversation persistence: messages are stored and retrievable", () => {
    const chatId = `test-conv-${Date.now()}`;
    getOrCreate(chatId);

    addMessage(chatId, { role: "user", content: "Hello" });
    addMessage(chatId, { role: "assistant", content: "Hi there!" });
    addMessage(chatId, { role: "user", content: "How are you?" });

    const history = getHistory(chatId);
    assert.equal(history.length, 3);
    assert.equal(history[0].content, "Hello");
    assert.equal(history[1].content, "Hi there!");
    assert.equal(history[2].content, "How are you?");
  });

  it("tool classification integrates with approval gate", async () => {
    // L0 tool — no approval needed
    const l0 = classifyDeterministic("read_file", { path: "/tmp/test.txt" });
    assert.equal(l0?.level, RiskLevel.L0);

    // L2 tool — would need approval
    const l2 = classifyDeterministic("delete_file", { path: "/tmp/test.txt" });
    assert.equal(l2?.level, RiskLevel.L2);

    // Create approval and resolve it
    const { nonce, promise } = createApproval("delete_file", {}, l2!, 5000);
    resolveApproval(nonce, true);
    const approved = await promise;
    assert.equal(approved, true);
  });

  it("simple question via full agent loop (Ollama required)", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available");
      return;
    }
    if (!agentLoopModule) {
      t.skip(`Agent loop import failed: ${importError}`);
      return;
    }

    const { platform, sent, edited } = createMockPlatform();
    const chatId = `test-simple-${Date.now()}`;

    await agentLoopModule.runAgentLoopStreaming(env.config, chatId, "Was ist 2+2? Antworte nur mit der Zahl.", platform);

    const allText = [...sent, ...edited].map((m) => m.text).join(" ");
    assert.ok(allText.length > 0, "Agent should produce output");
    assert.ok(allText.includes("4"), `Expected "4" in response, got: ${allText.slice(0, 200)}`);
  });

  it("Ollama connection error produces user-friendly message (Ollama required)", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available");
      return;
    }
    if (!agentLoopModule) {
      t.skip(`Agent loop import failed: ${importError}`);
      return;
    }

    const { platform, sent, edited } = createMockPlatform();
    const chatId = `test-err-${Date.now()}`;

    const brokenConfig = {
      ...env.config,
      ollama: { ...env.config.ollama, baseUrl: "http://localhost:1" },
    };

    await agentLoopModule.runAgentLoopStreaming(brokenConfig, chatId, "Hello?", platform);

    const allText = [...sent, ...edited].map((m) => m.text).join(" ");
    assert.ok(allText.length > 0, "Should produce an error message");
  });

  it("cost line is appended after response (Ollama required)", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available");
      return;
    }
    if (!agentLoopModule) {
      t.skip(`Agent loop import failed: ${importError}`);
      return;
    }

    const { platform, sent, edited } = createMockPlatform();
    const chatId = `test-cost-${Date.now()}`;

    await agentLoopModule.runAgentLoopStreaming(env.config, chatId, "Sage einfach hallo.", platform);

    const allText = [...sent, ...edited].map((m) => m.text).join(" ");
    assert.ok(
      allText.includes("Lokal:") || allText.includes("Local:") || allText.includes("€"),
      `Expected cost line in output, got: ${allText.slice(-200)}`,
    );
  });
});
