import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MessagingPlatform, ChatId, MessageRef } from "./platform.js";
import type { Classification } from "../approval/risk-classifier.js";
import { createStream, createClaudeCodeStream } from "./streamer.js";

function createMockPlatform(opts: { supportsEdit: boolean; maxMessageLength?: number }): {
  platform: MessagingPlatform;
  sent: Array<{ chatId: string; text: string }>;
  edited: Array<{ chatId: string; ref: string; text: string }>;
} {
  const sent: Array<{ chatId: string; text: string }> = [];
  const edited: Array<{ chatId: string; ref: string; text: string }> = [];
  let msgCounter = 0;

  const platform: MessagingPlatform = {
    name: "telegram",
    maxMessageLength: opts.maxMessageLength ?? 4096,
    supportsEdit: opts.supportsEdit,

    async sendMessage(chatId: ChatId, text: string): Promise<MessageRef> {
      msgCounter++;
      sent.push({ chatId, text });
      return String(msgCounter);
    },

    async editMessage(chatId: ChatId, ref: MessageRef, text: string): Promise<MessageRef> {
      edited.push({ chatId, ref, text });
      return ref;
    },

    async sendApproval(_chatId: ChatId, _nonce: string, _toolName: string, _args: Record<string, unknown>, _classification: Classification): Promise<void> {},
    async start(): Promise<void> {},
    async stop(): Promise<void> {},
  };

  return { platform, sent, edited };
}

describe("createStream", () => {
  describe("with supportsEdit: true", () => {
    it("sends initial message on start", async () => {
      const { platform, sent } = createMockPlatform({ supportsEdit: true });
      const stream = createStream(platform, "123");
      await stream.start();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].text, "...");
    });

    it("edits message on finish", async () => {
      const { platform, edited } = createMockPlatform({ supportsEdit: true });
      const stream = createStream(platform, "123");
      await stream.start();
      stream.append("hello world");
      await stream.finish();
      assert.ok(edited.length > 0);
      assert.equal(edited[edited.length - 1].text, "hello world");
    });
  });

  describe("with supportsEdit: false", () => {
    it("sends new message on finish", async () => {
      const { platform, sent } = createMockPlatform({ supportsEdit: false });
      const stream = createStream(platform, "123");
      await stream.start();
      stream.append("hello world");
      await stream.finish();
      // Initial "..." + final "hello world"
      assert.equal(sent.length, 2);
      assert.equal(sent[1].text, "hello world");
    });
  });
});

describe("createClaudeCodeStream", () => {
  it("sends start message", async () => {
    const { platform, sent } = createMockPlatform({ supportsEdit: true });
    const stream = createClaudeCodeStream(platform, "456");
    await stream.start();
    assert.equal(sent.length, 1);
    assert.ok(sent[0].text.includes("Claude Code"));
  });

  it("handles assistant events", async () => {
    const { platform, edited } = createMockPlatform({ supportsEdit: true });
    const stream = createClaudeCodeStream(platform, "456");
    await stream.start();
    stream.handleEvent({ type: "assistant", content: "working..." });
    // Force flush by waiting
    await new Promise((r) => setTimeout(r, 50));
    const result = await stream.finish();
    assert.ok(result.includes("working..."));
  });

  it("handles result events", async () => {
    const { platform } = createMockPlatform({ supportsEdit: true });
    const stream = createClaudeCodeStream(platform, "456");
    await stream.start();
    stream.handleEvent({ type: "result", content: "Done!" });
    const result = await stream.finish();
    assert.equal(result, "Done!");
  });

  it("returns (no output) when empty", async () => {
    const { platform } = createMockPlatform({ supportsEdit: true });
    const stream = createClaudeCodeStream(platform, "456");
    await stream.start();
    const result = await stream.finish();
    assert.equal(result, "(no output)");
  });

  it("truncates to maxMessageLength", async () => {
    const { platform, sent } = createMockPlatform({ supportsEdit: false, maxMessageLength: 20 });
    const stream = createClaudeCodeStream(platform, "456");
    await stream.start();
    stream.handleEvent({ type: "result", content: "A".repeat(50) });
    const result = await stream.finish();
    // sent[1] should be the truncated final message
    assert.equal(sent[sent.length - 1].text.length, 20);
    // The internal result buffer is untruncated
    assert.equal(result, "A".repeat(50));
  });
});
