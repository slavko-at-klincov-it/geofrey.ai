import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { formatCostLine } from "./format.js";
import { setLocale } from "../i18n/index.js";

describe("formatCostLine", () => {
  afterEach(() => {
    setLocale("de"); // restore default
  });

  it("formats DE locale with cloud and local tokens", () => {
    setLocale("de");
    const result = formatCostLine({ cloudTokens: 1247, cloudCostUsd: 0.02, localTokens: 847 });
    assert.ok(result.includes("Cloud:"));
    assert.ok(result.includes("Lokal:"));
    assert.ok(result.includes("1.247"));
    assert.ok(result.includes("847"));
    assert.ok(result.includes("\u20AC"));
  });

  it("formats EN locale with cloud and local tokens", () => {
    setLocale("en");
    const result = formatCostLine({ cloudTokens: 1247, cloudCostUsd: 0.02, localTokens: 847 });
    assert.ok(result.includes("Cloud:"));
    assert.ok(result.includes("Local:"));
    assert.ok(result.includes("1,247"));
    assert.ok(result.includes("$0.02"));
  });

  it("returns empty string when no tokens", () => {
    const result = formatCostLine({ cloudTokens: 0, cloudCostUsd: 0, localTokens: 0 });
    assert.equal(result, "");
  });

  it("shows only cloud when no local tokens", () => {
    setLocale("en");
    const result = formatCostLine({ cloudTokens: 500, cloudCostUsd: 0.01, localTokens: 0 });
    assert.ok(result.includes("Cloud:"));
    assert.ok(!result.includes("Local:"));
  });

  it("shows only local when no cloud tokens", () => {
    setLocale("en");
    const result = formatCostLine({ cloudTokens: 0, cloudCostUsd: 0, localTokens: 1000 });
    assert.ok(!result.includes("Cloud:"));
    assert.ok(result.includes("Local:"));
  });

  it("wraps in brackets", () => {
    const result = formatCostLine({ cloudTokens: 100, cloudCostUsd: 0.001, localTokens: 200 });
    assert.ok(result.includes("["));
    assert.ok(result.includes("]"));
  });
});
