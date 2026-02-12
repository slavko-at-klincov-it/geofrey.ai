import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { WizardState } from "./wizard.js";

describe("WizardState", () => {
  it("can construct minimal telegram state", () => {
    const state: WizardState = {
      platform: "telegram",
      telegram: { botToken: "123:abc", ownerId: 42, botUsername: "bot" },
      locale: "de",
      ollamaUrl: "http://localhost:11434",
      model: "qwen3:8b",
    };
    assert.equal(state.platform, "telegram");
    assert.equal(state.telegram?.ownerId, 42);
  });

  it("can construct whatsapp state", () => {
    const state: WizardState = {
      platform: "whatsapp",
      whatsapp: { phoneNumberId: "1", accessToken: "t", verifyToken: "v", ownerPhone: "49123", webhookPort: 3000 },
      locale: "de",
      ollamaUrl: "http://localhost:11434",
      model: "qwen3:8b",
    };
    assert.equal(state.platform, "whatsapp");
    assert.equal(state.whatsapp?.webhookPort, 3000);
  });

  it("can construct signal state", () => {
    const state: WizardState = {
      platform: "signal",
      signal: { signalCliSocket: "/tmp/socket", ownerPhone: "+49123", botPhone: "+49456" },
      locale: "de",
      ollamaUrl: "http://localhost:11434",
      model: "qwen3:8b",
    };
    assert.equal(state.platform, "signal");
    assert.equal(state.signal?.ownerPhone, "+49123");
  });

  it("claude auth is optional", () => {
    const state: WizardState = {
      platform: "telegram",
      telegram: { botToken: "123:abc", ownerId: 42, botUsername: "bot" },
      locale: "de",
      ollamaUrl: "http://localhost:11434",
      model: "qwen3:8b",
    };
    assert.equal(state.claude, undefined);
  });

  it("can import runWizard", async () => {
    const mod = await import("./wizard.js");
    assert.equal(typeof mod.runWizard, "function");
  });
});
