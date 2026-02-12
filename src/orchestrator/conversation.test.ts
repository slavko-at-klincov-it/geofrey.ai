import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getOrCreate, addMessage, getHistory, clearConversation } from "./conversation.js";

describe("conversation", () => {
  let chatId = 1000;
  beforeEach(() => chatId++);

  describe("getOrCreate", () => {
    it("creates new conversation for unknown chatId", () => {
      const conv = getOrCreate(chatId);
      assert.equal(conv.telegramChatId, chatId);
      assert.ok(conv.id);
      assert.deepEqual(conv.messages, []);
    });

    it("returns cached conversation for same chatId", () => {
      const a = getOrCreate(chatId);
      const b = getOrCreate(chatId);
      assert.equal(a.id, b.id);
    });
  });

  describe("addMessage", () => {
    it("adds message to conversation", () => {
      addMessage(chatId, { role: "user", content: "hello" });
      const conv = getOrCreate(chatId);
      assert.equal(conv.messages.length, 1);
      assert.equal(conv.messages[0].content, "hello");
    });

    it("updates timestamp", () => {
      const before = getOrCreate(chatId).updatedAt;
      addMessage(chatId, { role: "user", content: "hi" });
      const after = getOrCreate(chatId).updatedAt;
      assert.ok(after >= before);
    });
  });

  describe("getHistory", () => {
    it("returns messages in order", () => {
      addMessage(chatId, { role: "user", content: "first" });
      addMessage(chatId, { role: "assistant", content: "second" });
      const history = getHistory(chatId);
      assert.equal(history.length, 2);
      assert.equal(history[0].content, "first");
      assert.equal(history[1].content, "second");
    });
  });

  describe("clearConversation", () => {
    it("removes conversation from cache", () => {
      addMessage(chatId, { role: "user", content: "test" });
      clearConversation(chatId);
      const conv = getOrCreate(chatId);
      assert.deepEqual(conv.messages, []);
    });
  });
});
