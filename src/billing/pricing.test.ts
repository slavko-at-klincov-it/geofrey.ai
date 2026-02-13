import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getModelPricing, calculateCost } from "./pricing.js";

describe("pricing", () => {
  describe("getModelPricing", () => {
    it("returns correct pricing for known Claude model", () => {
      const pricing = getModelPricing("claude-sonnet-4-5-20250929");
      assert.equal(pricing.inputPer1kTokens, 0.003);
      assert.equal(pricing.outputPer1kTokens, 0.015);
    });

    it("returns correct pricing for Claude Opus", () => {
      const pricing = getModelPricing("claude-opus-4-6");
      assert.equal(pricing.inputPer1kTokens, 0.015);
      assert.equal(pricing.outputPer1kTokens, 0.075);
    });

    it("returns correct pricing for Claude Haiku", () => {
      const pricing = getModelPricing("claude-haiku-4-5-20251001");
      assert.equal(pricing.inputPer1kTokens, 0.0008);
      assert.equal(pricing.outputPer1kTokens, 0.004);
    });

    it("returns zero pricing for local Ollama models", () => {
      const pricing = getModelPricing("qwen3:8b");
      assert.equal(pricing.inputPer1kTokens, 0);
      assert.equal(pricing.outputPer1kTokens, 0);
    });

    it("returns zero pricing for unknown models", () => {
      const pricing = getModelPricing("some-unknown-model");
      assert.equal(pricing.inputPer1kTokens, 0);
      assert.equal(pricing.outputPer1kTokens, 0);
    });
  });

  describe("calculateCost", () => {
    it("calculates cost for Sonnet with typical token counts", () => {
      // 1000 input + 500 output
      const cost = calculateCost("claude-sonnet-4-5-20250929", 1000, 500);
      // (1000/1000)*0.003 + (500/1000)*0.015 = 0.003 + 0.0075 = 0.0105
      assert.ok(Math.abs(cost - 0.0105) < 1e-10);
    });

    it("calculates cost for Opus with large token counts", () => {
      const cost = calculateCost("claude-opus-4-6", 10000, 5000);
      // (10000/1000)*0.015 + (5000/1000)*0.075 = 0.15 + 0.375 = 0.525
      assert.equal(cost, 0.525);
    });

    it("returns zero cost for local models", () => {
      const cost = calculateCost("qwen3:8b", 5000, 2000);
      assert.equal(cost, 0);
    });

    it("returns zero cost for unknown models", () => {
      const cost = calculateCost("unknown-model", 5000, 2000);
      assert.equal(cost, 0);
    });

    it("handles zero token counts", () => {
      const cost = calculateCost("claude-sonnet-4-5-20250929", 0, 0);
      assert.equal(cost, 0);
    });

    it("handles input-only requests", () => {
      const cost = calculateCost("claude-sonnet-4-5-20250929", 2000, 0);
      // (2000/1000)*0.003 = 0.006
      assert.equal(cost, 0.006);
    });
  });
});
