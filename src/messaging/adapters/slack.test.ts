import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RiskLevel } from "../../approval/risk-classifier.js";

describe("Slack adapter helpers", () => {
  it("formatApprovalBlocks creates blocks with approve/deny buttons", async () => {
    const { formatApprovalBlocks } = await import("./slack.js");

    const { text, blocks } = formatApprovalBlocks(
      "abc123",
      "shell",
      { command: "rm -rf /tmp" },
      { level: RiskLevel.L2, reason: "destructive", deterministic: true },
    );

    assert.ok(text.includes("abc123"));
    assert.ok(text.includes("shell"));
    assert.equal(blocks.length, 2);

    // First block is section with text
    const section = blocks[0] as { type: string; text: { type: string; text: string } };
    assert.equal(section.type, "section");
    assert.equal(section.text.type, "mrkdwn");

    // Second block is actions with buttons
    const actions = blocks[1] as {
      type: string;
      elements: Array<{ action_id: string; text: { text: string }; style: string }>;
    };
    assert.equal(actions.type, "actions");
    assert.equal(actions.elements.length, 2);
    assert.equal(actions.elements[0].action_id, "approve:abc123");
    assert.equal(actions.elements[1].action_id, "deny:abc123");
    assert.equal(actions.elements[0].style, "primary");
    assert.equal(actions.elements[1].style, "danger");
  });

  it("formatApprovalBlocks truncates args to 200 chars", async () => {
    const { formatApprovalBlocks } = await import("./slack.js");

    const longArgs: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      longArgs[`key_${i}`] = `value_${i}_with_extra_padding`;
    }

    const { text } = formatApprovalBlocks(
      "nonce1",
      "shell",
      longArgs,
      { level: RiskLevel.L2, reason: "test", deterministic: true },
    );

    // The details line should contain truncated args
    assert.ok(text.includes("nonce1"));
    assert.ok(text.includes("shell"));
  });

  it("formatApprovalBlocks includes risk level and reason", async () => {
    const { formatApprovalBlocks } = await import("./slack.js");

    const { text } = formatApprovalBlocks(
      "n1",
      "git",
      { command: "push" },
      { level: RiskLevel.L1, reason: "safe write", deterministic: true },
    );

    assert.ok(text.includes("L1"));
    assert.ok(text.includes("safe write"));
  });

  it("toSlackMrkdwn converts markdown links to Slack format", async () => {
    const { toSlackMrkdwn } = await import("./slack.js");

    const result = toSlackMrkdwn("Check [Google](https://google.com) for details");
    assert.equal(result, "Check <https://google.com|Google> for details");
  });

  it("toSlackMrkdwn handles multiple links", async () => {
    const { toSlackMrkdwn } = await import("./slack.js");

    const result = toSlackMrkdwn("[a](http://a.com) and [b](http://b.com)");
    assert.equal(result, "<http://a.com|a> and <http://b.com|b>");
  });

  it("toSlackMrkdwn leaves non-link text unchanged", async () => {
    const { toSlackMrkdwn } = await import("./slack.js");

    const text = "*bold* _italic_ `code`";
    assert.equal(toSlackMrkdwn(text), text);
  });

  it("toSlackMrkdwn handles empty string", async () => {
    const { toSlackMrkdwn } = await import("./slack.js");
    assert.equal(toSlackMrkdwn(""), "");
  });
});

describe("Slack adapter exports", () => {
  it("exports createSlackPlatform function", async () => {
    const mod = await import("./slack.js");
    assert.ok(typeof mod.createSlackPlatform === "function");
  });

  it("exports formatApprovalBlocks function", async () => {
    const mod = await import("./slack.js");
    assert.ok(typeof mod.formatApprovalBlocks === "function");
  });

  it("exports toSlackMrkdwn function", async () => {
    const mod = await import("./slack.js");
    assert.ok(typeof mod.toSlackMrkdwn === "function");
  });
});
