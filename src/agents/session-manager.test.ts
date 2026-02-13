import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  agentChatId,
  ensureAgentSession,
  addAgentMessage,
  getAgentHistory,
  getAgentRecentHistory,
  getAgentMessageCount,
  formatAgentHistory,
} from "./session-manager.js";

describe("session-manager", () => {
  describe("agentChatId", () => {
    it("creates namespaced chatId", () => {
      const result = agentChatId("coder", "user-123");
      assert.equal(result, "agent:coder:user-123");
    });

    it("creates different namespaces for different agents", () => {
      const a = agentChatId("coder", "chat-1");
      const b = agentChatId("researcher", "chat-1");
      assert.notEqual(a, b);
    });

    it("creates different namespaces for different chats", () => {
      const a = agentChatId("coder", "chat-1");
      const b = agentChatId("coder", "chat-2");
      assert.notEqual(a, b);
    });
  });

  describe("ensureAgentSession", () => {
    it("creates session without error", () => {
      // Should not throw
      ensureAgentSession("test-agent", "session-test-1");
    });

    it("is idempotent", () => {
      ensureAgentSession("test-agent", "session-test-2");
      ensureAgentSession("test-agent", "session-test-2");
      // Should still work fine
      const history = getAgentHistory("test-agent", "session-test-2");
      assert.ok(Array.isArray(history));
    });
  });

  describe("addAgentMessage + getAgentHistory", () => {
    it("adds and retrieves messages", () => {
      const agentId = "msg-test-agent";
      const chatId = `msg-test-${Date.now()}`;

      ensureAgentSession(agentId, chatId);
      addAgentMessage(agentId, chatId, { role: "user", content: "Hello agent" });
      addAgentMessage(agentId, chatId, { role: "assistant", content: "Hello user" });

      const history = getAgentHistory(agentId, chatId);
      assert.equal(history.length, 2);
      assert.equal(history[0].role, "user");
      assert.equal(history[0].content, "Hello agent");
      assert.equal(history[1].role, "assistant");
      assert.equal(history[1].content, "Hello user");
    });

    it("isolates messages between agents", () => {
      const chatId = `isolate-${Date.now()}`;

      addAgentMessage("agent-a", chatId, { role: "user", content: "For agent A" });
      addAgentMessage("agent-b", chatId, { role: "user", content: "For agent B" });

      const historyA = getAgentHistory("agent-a", chatId);
      const historyB = getAgentHistory("agent-b", chatId);

      assert.equal(historyA.length, 1);
      assert.equal(historyA[0].content, "For agent A");
      assert.equal(historyB.length, 1);
      assert.equal(historyB[0].content, "For agent B");
    });

    it("assigns unique IDs and timestamps", () => {
      const agentId = "id-test";
      const chatId = `id-${Date.now()}`;

      const msg1 = addAgentMessage(agentId, chatId, { role: "user", content: "First" });
      const msg2 = addAgentMessage(agentId, chatId, { role: "user", content: "Second" });

      assert.ok(msg1.id);
      assert.ok(msg2.id);
      assert.notEqual(msg1.id, msg2.id);
      assert.ok(msg1.createdAt instanceof Date);
      assert.ok(msg2.createdAt instanceof Date);
    });
  });

  describe("getAgentRecentHistory", () => {
    it("returns last N messages", () => {
      const agentId = "recent-test";
      const chatId = `recent-${Date.now()}`;

      for (let i = 0; i < 10; i++) {
        addAgentMessage(agentId, chatId, { role: "user", content: `Message ${i}` });
      }

      const recent = getAgentRecentHistory(agentId, chatId, 3);
      assert.equal(recent.length, 3);
      assert.equal(recent[0].content, "Message 7");
      assert.equal(recent[1].content, "Message 8");
      assert.equal(recent[2].content, "Message 9");
    });

    it("returns all messages when count exceeds history", () => {
      const agentId = "few-test";
      const chatId = `few-${Date.now()}`;

      addAgentMessage(agentId, chatId, { role: "user", content: "Only one" });

      const recent = getAgentRecentHistory(agentId, chatId, 50);
      assert.equal(recent.length, 1);
    });

    it("defaults to 20 messages", () => {
      const agentId = "default-test";
      const chatId = `default-${Date.now()}`;

      for (let i = 0; i < 30; i++) {
        addAgentMessage(agentId, chatId, { role: "user", content: `Msg ${i}` });
      }

      const recent = getAgentRecentHistory(agentId, chatId);
      assert.equal(recent.length, 20);
    });
  });

  describe("getAgentMessageCount", () => {
    it("returns 0 for new session", () => {
      const count = getAgentMessageCount("count-test", `empty-${Date.now()}`);
      assert.equal(count, 0);
    });

    it("returns correct count after adding messages", () => {
      const agentId = "count-test-2";
      const chatId = `count-${Date.now()}`;

      addAgentMessage(agentId, chatId, { role: "user", content: "One" });
      addAgentMessage(agentId, chatId, { role: "assistant", content: "Two" });
      addAgentMessage(agentId, chatId, { role: "user", content: "Three" });

      assert.equal(getAgentMessageCount(agentId, chatId), 3);
    });
  });

  describe("formatAgentHistory", () => {
    it("returns no-history message for empty session", () => {
      const result = formatAgentHistory("empty-agent", `format-empty-${Date.now()}`);
      assert.ok(result.includes("No conversation history"));
      assert.ok(result.includes("empty-agent"));
    });

    it("formats messages with timestamps and roles", () => {
      const agentId = "format-test";
      const chatId = `format-${Date.now()}`;

      addAgentMessage(agentId, chatId, { role: "user", content: "Hello" });
      addAgentMessage(agentId, chatId, { role: "assistant", content: "World" });

      const result = formatAgentHistory(agentId, chatId);
      assert.ok(result.includes("format-test"));
      assert.ok(result.includes("2 messages"));
      assert.ok(result.includes("USER: Hello"));
      assert.ok(result.includes("ASSISTANT: World"));
    });

    it("truncates long messages at 500 chars", () => {
      const agentId = "truncate-test";
      const chatId = `truncate-${Date.now()}`;

      const longContent = "x".repeat(600);
      addAgentMessage(agentId, chatId, { role: "user", content: longContent });

      const result = formatAgentHistory(agentId, chatId);
      assert.ok(result.includes("..."));
      // The truncated content should be at most 503 chars (500 + "...")
      const lines = result.split("\n");
      const contentLine = lines.find((l) => l.includes("USER:"));
      assert.ok(contentLine);
      // Extract content after "USER: "
      const contentPart = contentLine.split("USER: ")[1];
      assert.ok(contentPart.length <= 503);
    });

    it("respects count parameter", () => {
      const agentId = "count-format";
      const chatId = `count-format-${Date.now()}`;

      for (let i = 0; i < 10; i++) {
        addAgentMessage(agentId, chatId, { role: "user", content: `Msg ${i}` });
      }

      const result = formatAgentHistory(agentId, chatId, 3);
      assert.ok(result.includes("3 messages"));
    });
  });
});
