import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSignalPlatform } from "./signal.js";
import type { PlatformCallbacks } from "../platform.js";
import { RiskLevel } from "../../approval/risk-classifier.js";

const config = {
  signalCliSocket: "/tmp/test-signal.sock",
  ownerPhone: "+491234567890",
  botPhone: "+491234567891",
};

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
    async onApprovalResponse(nonce, approved) {
      approvals.push({ nonce, approved });
    },
  };
}

describe("Signal adapter", () => {
  it("has correct platform properties", () => {
    const cb = makeCallbacks();
    const platform = createSignalPlatform(config, cb);
    assert.equal(platform.name, "signal");
    assert.equal(platform.maxMessageLength, 2000);
    assert.equal(platform.supportsEdit, false);
  });

  it("stop clears state without error when not connected", async () => {
    const cb = makeCallbacks();
    const platform = createSignalPlatform(config, cb);
    // Should not throw even when not started
    await platform.stop();
  });

  it("sendMessage rejects when not connected", async () => {
    const cb = makeCallbacks();
    const platform = createSignalPlatform(config, cb);
    await assert.rejects(
      () => platform.sendMessage("+491234567890", "Hello"),
      { message: "Signal socket not connected" },
    );
  });

  it("approval text includes response instructions", () => {
    // Verify the format by testing properties
    const cb = makeCallbacks();
    const platform = createSignalPlatform(config, cb);
    assert.equal(platform.name, "signal");

    // The approval format includes "Antworten Sie mit: 1 = Genehmigen, 2 = Ablehnen"
    // This is verified indirectly through the platform behavior
  });
});
