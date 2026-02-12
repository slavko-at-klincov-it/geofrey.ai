import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatApproval } from "./approval-ui.js";
import { RiskLevel } from "../approval/risk-classifier.js";

describe("formatApproval", () => {
  const classification = { level: RiskLevel.L2, reason: "test reason", deterministic: true };

  it("contains nonce in text", () => {
    const { text } = formatApproval("abc123", "delete_file", { path: "/tmp" }, classification);
    assert.ok(text.includes("abc123"));
  });

  it("contains tool name", () => {
    const { text } = formatApproval("n1", "delete_file", {}, classification);
    assert.ok(text.includes("delete_file"));
  });

  it("contains risk level", () => {
    const { text } = formatApproval("n1", "delete_file", {}, classification);
    assert.ok(text.includes("L2"));
  });

  it("keyboard has approve and deny buttons", () => {
    const { keyboard } = formatApproval("n1", "delete_file", {}, classification);
    const rows = keyboard.inline_keyboard;
    assert.ok(rows.length > 0);
    const buttons = rows[0];
    assert.ok(buttons.some((b) => "callback_data" in b && b.callback_data === "approve:n1"));
    assert.ok(buttons.some((b) => "callback_data" in b && b.callback_data === "deny:n1"));
  });

  it("truncates long args", () => {
    const longArgs = { data: "x".repeat(300) };
    const { text } = formatApproval("n1", "tool", longArgs, classification);
    assert.ok(!text.includes("x".repeat(300)));
  });

  it("escapes markdown characters", () => {
    const c = { ...classification, reason: "test_reason*bold" };
    const { text } = formatApproval("n1", "tool", {}, c);
    assert.ok(text.includes("test\\_reason\\*bold"));
  });
});
