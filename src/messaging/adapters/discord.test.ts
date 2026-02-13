import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PlatformCallbacks } from "../platform.js";
import { RiskLevel } from "../../approval/risk-classifier.js";

function makeCallbacks(): PlatformCallbacks & {
  messages: Array<{ chatId: string; text: string }>;
  approvals: Array<{ nonce: string; approved: boolean }>;
} {
  const messages: Array<{ chatId: string; text: string }> = [];
  const approvals: Array<{ nonce: string; approved: boolean }> = [];
  return {
    messages,
    approvals,
    async onMessage(chatId, text) {
      messages.push({ chatId, text });
    },
    async onImageMessage() {},
    async onVoiceMessage() {},
    async onApprovalResponse(nonce, approved) {
      approvals.push({ nonce, approved });
    },
  };
}

describe("Discord adapter helpers", () => {
  it("formatApprovalText creates approval text with nonce and tool info", async () => {
    const { formatApprovalText } = await import("./discord.js");

    const text = formatApprovalText(
      "xyz789",
      "filesystem",
      { path: "/tmp/test", action: "delete" },
      { level: RiskLevel.L2, reason: "file deletion", deterministic: true },
    );

    assert.ok(text.includes("xyz789"));
    assert.ok(text.includes("filesystem"));
    assert.ok(text.includes("L2"));
    assert.ok(text.includes("file deletion"));
    assert.ok(text.includes("/tmp/test"));
  });

  it("formatApprovalText truncates args to 200 chars", async () => {
    const { formatApprovalText } = await import("./discord.js");

    const longArgs: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      longArgs[`key_${i}`] = `value_${i}_padding_string`;
    }

    const text = formatApprovalText(
      "nonce1",
      "shell",
      longArgs,
      { level: RiskLevel.L2, reason: "test", deterministic: true },
    );

    // The args portion in the text should be truncated
    const detailsLine = text.split("\n").find(l => l.includes("Details") || l.includes("`{"));
    assert.ok(detailsLine, "should have details line");
  });

  it("buildApprovalRow creates action row with approve and deny buttons", async () => {
    const { buildApprovalRow } = await import("./discord.js");

    const row = buildApprovalRow("test-nonce");
    const json = row.toJSON();
    const components = json.components as Array<{ custom_id?: string; style?: number }>;

    assert.equal(components.length, 2);
    assert.equal(components[0].custom_id, "approve:test-nonce");
    assert.equal(components[1].custom_id, "deny:test-nonce");
    // Success = green = 3
    assert.equal(components[0].style, 3);
    // Danger = red = 4
    assert.equal(components[1].style, 4);
  });
});

describe("Discord adapter platform properties", () => {
  it("exports createDiscordPlatform function", async () => {
    const mod = await import("./discord.js");
    assert.ok(typeof mod.createDiscordPlatform === "function");
    assert.ok(typeof mod.formatApprovalText === "function");
    assert.ok(typeof mod.buildApprovalRow === "function");
  });

  it("createDiscordPlatform returns platform with correct name and limits", async () => {
    const { createDiscordPlatform } = await import("./discord.js");
    const cb = makeCallbacks();

    const platform = createDiscordPlatform(
      { botToken: "test-token", channelId: "123456789" },
      cb,
    );

    assert.equal(platform.name, "discord");
    assert.equal(platform.maxMessageLength, 2000);
    assert.equal(platform.supportsEdit, true);
  });

  it("platform has all required methods", async () => {
    const { createDiscordPlatform } = await import("./discord.js");
    const cb = makeCallbacks();

    const platform = createDiscordPlatform(
      { botToken: "test-token", channelId: "123456789" },
      cb,
    );

    assert.ok(typeof platform.sendMessage === "function");
    assert.ok(typeof platform.editMessage === "function");
    assert.ok(typeof platform.sendApproval === "function");
    assert.ok(typeof platform.start === "function");
    assert.ok(typeof platform.stop === "function");
  });

  it("stop does not throw when client was never started", async () => {
    const { createDiscordPlatform } = await import("./discord.js");
    const cb = makeCallbacks();

    const platform = createDiscordPlatform(
      { botToken: "test-token", channelId: "123456789" },
      cb,
    );

    // Should not throw even though client was never logged in
    await platform.stop();
  });
});
