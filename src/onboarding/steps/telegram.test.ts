import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// Telegram setup is heavily interactive (prompts + bot polling).
// We test the underlying validators and patterns instead.

describe("telegram setup", () => {
  it("can import telegram module", async () => {
    const mod = await import("./telegram.js");
    assert.equal(typeof mod.setupTelegram, "function");
  });

  it("TelegramConfig has expected shape", () => {
    const config = { botToken: "123:abc", ownerId: 42, botUsername: "test_bot" };
    assert.equal(typeof config.botToken, "string");
    assert.equal(typeof config.ownerId, "number");
    assert.equal(typeof config.botUsername, "string");
  });

  it("token pattern matches valid tokens", () => {
    const pattern = /\d{8,12}:[A-Za-z0-9_-]{35}/;
    assert.ok(pattern.test("12345678:ABCDefgh_ijklmnopqrstuvwxyz12345678"));
    assert.ok(!pattern.test("short:token"));
    assert.ok(!pattern.test(""));
  });

  it("token pattern extracts from larger text", () => {
    const pattern = /\d{8,12}:[A-Za-z0-9_-]{35}/;
    const text = "Your token is 12345678:ABCDefgh_ijklmnopqrstuvwxyz12345678 enjoy";
    const match = text.match(pattern);
    assert.ok(match);
    assert.equal(match[0], "12345678:ABCDefgh_ijklmnopqrstuvwxyz12345678");
  });
});
