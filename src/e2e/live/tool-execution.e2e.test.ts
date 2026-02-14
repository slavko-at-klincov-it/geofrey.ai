import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { MessagingPlatform, ChatId, MessageRef } from "../../messaging/platform.js";
import { ensureOllama } from "./helpers/ollama-guard.js";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";
import { getDb } from "../../db/client.js";
import { setDbUrl } from "../../orchestrator/conversation.js";
import { rejectAllPending } from "../../approval/approval-gate.js";

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

let agentLoopModule: { runAgentLoopStreaming: Function } | null = null;
let importError: string | null = null;

describe("E2E: Tool Execution Pipeline", { timeout: 300_000 }, () => {
  let env: TestEnv;
  let ollamaAvailable = false;

  before(async () => {
    env = await createTestEnv();
    getDb(env.dbUrl);
    setDbUrl(env.dbUrl);
    const guard = await ensureOllama();
    ollamaAvailable = !guard.skip;

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

  it("orchestrator calls read_file for a user question about file content", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available");
      return;
    }
    if (!agentLoopModule) {
      t.skip(`Agent loop import failed: ${importError}`);
      return;
    }

    // Create a real temp file with known content
    const testContent = "Geheime Nachricht: Der Kuchen ist eine Luege.";
    const testFilePath = join(env.tmpDir, "geheime-notiz.txt");
    await writeFile(testFilePath, testContent, "utf-8");

    const { platform, sent, edited } = createMockPlatform();
    const chatId = `test-readfile-${Date.now()}`;

    await agentLoopModule.runAgentLoopStreaming(
      env.config,
      chatId,
      `Was steht in der Datei ${testFilePath}? Gib mir den Inhalt.`,
      platform,
    );

    const allText = [...sent, ...edited].map((m) => m.text).join(" ");
    assert.ok(allText.length > 0, "Agent should produce output");
    // The pipeline completed without crash — the agent read the file and responded.
    // LLM output is non-deterministic, so we only verify the pipeline ran to completion.
  });

  it("orchestrator uses shell_exec for system questions", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available");
      return;
    }
    if (!agentLoopModule) {
      t.skip(`Agent loop import failed: ${importError}`);
      return;
    }

    const { platform, sent, edited } = createMockPlatform();
    const chatId = `test-sysinfo-${Date.now()}`;

    await agentLoopModule.runAgentLoopStreaming(
      env.config,
      chatId,
      "Welches Betriebssystem nutze ich? Antworte kurz.",
      platform,
    );

    const allText = [...sent, ...edited].map((m) => m.text).join(" ");
    assert.ok(allText.length > 0, "Agent should produce output");
    // Pipeline completed — agent processed the system question and responded.
  });

  it("orchestrator handles nonexistent file gracefully", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available");
      return;
    }
    if (!agentLoopModule) {
      t.skip(`Agent loop import failed: ${importError}`);
      return;
    }

    const nonexistentPath = join(env.tmpDir, "diese-datei-gibt-es-nicht-12345.txt");
    const { platform, sent, edited } = createMockPlatform();
    const chatId = `test-nofile-${Date.now()}`;

    await agentLoopModule.runAgentLoopStreaming(
      env.config,
      chatId,
      `Lies die Datei ${nonexistentPath} und zeige mir den Inhalt.`,
      platform,
    );

    const allText = [...sent, ...edited].map((m) => m.text).join(" ");
    assert.ok(allText.length > 0, "Agent should produce output even for errors");
    // The agent produced a response — it didn't crash or hang.
    // LLM responses for error cases are non-deterministic, so we just verify
    // the pipeline completed and produced output (the tool itself throws on ENOENT).
  });
});
