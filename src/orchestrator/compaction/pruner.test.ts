import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pruneToolResults, pruneOldMessages } from "./pruner.js";

describe("pruner", () => {
  describe("pruneToolResults", () => {
    it("does not truncate short tool messages", () => {
      const messages = [{ role: "tool", content: "short output" }];
      const result = pruneToolResults(messages);
      assert.equal(result[0].content, "short output");
    });

    it("does not truncate tool messages at exactly 500 chars", () => {
      const content = "a".repeat(500);
      const messages = [{ role: "tool", content }];
      const result = pruneToolResults(messages);
      assert.equal(result[0].content, content);
    });

    it("truncates tool messages longer than 500 chars", () => {
      const content = "a".repeat(600);
      const messages = [{ role: "tool", content }];
      const result = pruneToolResults(messages);
      assert.equal(result[0].content.length, 212); // 200 + " [truncated]"
      assert.ok(result[0].content.endsWith("[truncated]"));
    });

    it("does not truncate non-tool messages", () => {
      const content = "a".repeat(600);
      const messages = [{ role: "user", content }];
      const result = pruneToolResults(messages);
      assert.equal(result[0].content, content);
    });

    it("handles mixed message types", () => {
      const messages = [
        { role: "user", content: "a".repeat(600) },
        { role: "tool", content: "b".repeat(600) },
        { role: "assistant", content: "c".repeat(600) },
        { role: "tool", content: "short" },
      ];
      const result = pruneToolResults(messages);
      assert.equal(result[0].content.length, 600); // user: not truncated
      assert.ok(result[1].content.endsWith("[truncated]")); // tool: truncated
      assert.equal(result[2].content.length, 600); // assistant: not truncated
      assert.equal(result[3].content, "short"); // tool: short, not truncated
    });

    it("handles empty array", () => {
      const result = pruneToolResults([]);
      assert.deepEqual(result, []);
    });
  });

  describe("pruneOldMessages", () => {
    it("returns all as recent when fewer messages than keepRecent", () => {
      const messages = [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ];
      const { old, recent } = pruneOldMessages(messages, 5);
      assert.equal(old.length, 0);
      assert.equal(recent.length, 2);
    });

    it("returns all as recent when exactly keepRecent", () => {
      const messages = [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ];
      const { old, recent } = pruneOldMessages(messages, 2);
      assert.equal(old.length, 0);
      assert.equal(recent.length, 2);
    });

    it("splits correctly when more messages than keepRecent", () => {
      const messages = [
        { role: "user", content: "1" },
        { role: "assistant", content: "2" },
        { role: "user", content: "3" },
        { role: "assistant", content: "4" },
        { role: "user", content: "5" },
      ];
      const { old, recent } = pruneOldMessages(messages, 2);
      assert.equal(old.length, 3);
      assert.equal(recent.length, 2);
      assert.equal(old[0].content, "1");
      assert.equal(old[2].content, "3");
      assert.equal(recent[0].content, "4");
      assert.equal(recent[1].content, "5");
    });

    it("handles empty array", () => {
      const { old, recent } = pruneOldMessages([], 5);
      assert.equal(old.length, 0);
      assert.equal(recent.length, 0);
    });

    it("handles keepRecent of 0", () => {
      const messages = [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ];
      const { old, recent } = pruneOldMessages(messages, 0);
      assert.equal(old.length, 2);
      assert.equal(recent.length, 0);
    });
  });
});
