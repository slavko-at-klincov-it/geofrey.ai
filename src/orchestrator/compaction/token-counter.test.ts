import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estimateTokens,
  estimateMessagesTokens,
  getContextUsagePercent,
  shouldCompact,
} from "./token-counter.js";

describe("token-counter", () => {
  describe("estimateTokens", () => {
    it("returns 0 for empty string", () => {
      assert.equal(estimateTokens(""), 0);
    });

    it("estimates ~1 token per 4 characters", () => {
      assert.equal(estimateTokens("abcd"), 1);
      assert.equal(estimateTokens("abcde"), 2);
      assert.equal(estimateTokens("abcdefgh"), 2);
    });

    it("rounds up for partial tokens", () => {
      assert.equal(estimateTokens("ab"), 1);
      assert.equal(estimateTokens("a"), 1);
    });

    it("handles longer strings", () => {
      const text = "a".repeat(100);
      assert.equal(estimateTokens(text), 25);
    });
  });

  describe("estimateMessagesTokens", () => {
    it("returns 0 for empty array", () => {
      assert.equal(estimateMessagesTokens([]), 0);
    });

    it("includes per-message overhead", () => {
      const messages = [{ role: "user", content: "abcd" }];
      // 1 token for content + 4 tokens overhead = 5
      assert.equal(estimateMessagesTokens(messages), 5);
    });

    it("sums multiple messages", () => {
      const messages = [
        { role: "user", content: "abcd" },    // 1 + 4 = 5
        { role: "assistant", content: "abcd" }, // 1 + 4 = 5
      ];
      assert.equal(estimateMessagesTokens(messages), 10);
    });

    it("handles messages with varying content lengths", () => {
      const messages = [
        { role: "user", content: "" },          // 0 + 4 = 4
        { role: "assistant", content: "a".repeat(100) }, // 25 + 4 = 29
      ];
      assert.equal(estimateMessagesTokens(messages), 33);
    });
  });

  describe("getContextUsagePercent", () => {
    it("returns 0 for empty messages", () => {
      assert.equal(getContextUsagePercent([], 16384), 0);
    });

    it("returns 0 for maxContextTokens of 0", () => {
      assert.equal(getContextUsagePercent([{ role: "user", content: "hi" }], 0), 0);
    });

    it("calculates percentage correctly", () => {
      // 5 tokens out of 100 = 5%
      const messages = [{ role: "user", content: "abcd" }]; // 1 + 4 = 5
      const pct = getContextUsagePercent(messages, 100);
      assert.equal(pct, 5);
    });

    it("caps at 100%", () => {
      const messages = [{ role: "user", content: "a".repeat(1000) }]; // 250 + 4 = 254
      const pct = getContextUsagePercent(messages, 10);
      assert.equal(pct, 100);
    });
  });

  describe("shouldCompact", () => {
    it("returns false when below threshold", () => {
      const messages = [{ role: "user", content: "abcd" }]; // 5 tokens
      assert.equal(shouldCompact(messages, 16384), false);
    });

    it("returns true when above threshold", () => {
      // Create messages that exceed 75% of 100 tokens
      const messages = [{ role: "user", content: "a".repeat(400) }]; // 100 + 4 = 104
      assert.equal(shouldCompact(messages, 100), true);
    });

    it("respects custom threshold", () => {
      const messages = [{ role: "user", content: "a".repeat(200) }]; // 50 + 4 = 54
      // 54/100 = 54% — below 75% default but above 50% custom
      assert.equal(shouldCompact(messages, 100, 50), true);
      assert.equal(shouldCompact(messages, 100, 75), false);
    });

    it("returns false for empty messages", () => {
      assert.equal(shouldCompact([], 16384), false);
    });
  });
});
