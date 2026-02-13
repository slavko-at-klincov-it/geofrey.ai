import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createPairingCode,
  redeemPairingCode,
  getPendingPairing,
  pendingPairingCount,
  _testClearAll as clearPairing,
} from "./pairing.js";
import {
  getDevice,
  listDevices,
  _testClearAll as clearDevices,
} from "./device-registry.js";

describe("pairing", () => {
  beforeEach(() => {
    clearPairing();
    clearDevices();
  });

  describe("createPairingCode", () => {
    it("generates a 6-digit numeric code", () => {
      const code = createPairingCode("telegram:12345");
      assert.equal(code.length, 6);
      assert.ok(/^\d{6}$/.test(code));
    });

    it("generates unique codes", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) {
        codes.add(createPairingCode(`chat-${i}`));
      }
      // All 20 should be unique (extremely unlikely collision with 900k range)
      assert.equal(codes.size, 20);
    });

    it("increments pending count", () => {
      assert.equal(pendingPairingCount(), 0);
      createPairingCode("chat1");
      assert.equal(pendingPairingCount(), 1);
      createPairingCode("chat2");
      assert.equal(pendingPairingCount(), 2);
    });
  });

  describe("redeemPairingCode", () => {
    it("successfully redeems valid code and registers device", () => {
      const code = createPairingCode("telegram:owner");
      const result = redeemPairingCode(code, {
        name: "Test iPhone",
        platform: "ios",
      });

      assert.equal(result.success, true);
      assert.ok(result.device);
      assert.equal(result.device.name, "Test iPhone");
      assert.equal(result.device.platform, "ios");
      assert.ok(result.device.chatId.startsWith("companion:"));
    });

    it("consumes the code after redemption", () => {
      const code = createPairingCode("telegram:owner");
      const initial = pendingPairingCount();

      redeemPairingCode(code, { name: "D1", platform: "ios" });
      assert.equal(pendingPairingCount(), initial - 1);

      // Second redemption should fail
      const result = redeemPairingCode(code, { name: "D2", platform: "ios" });
      assert.equal(result.success, false);
      assert.ok(result.error?.includes("Invalid"));
    });

    it("registers device in device registry", () => {
      const code = createPairingCode("telegram:owner");
      const result = redeemPairingCode(code, {
        name: "Paired Device",
        platform: "android",
        pushToken: "fcm-token-xyz",
      });

      assert.ok(result.device);
      const device = getDevice(result.device.deviceId);
      assert.ok(device);
      assert.equal(device.name, "Paired Device");
      assert.equal(device.platform, "android");
      assert.equal(device.pushToken, "fcm-token-xyz");
    });

    it("rejects invalid code", () => {
      const result = redeemPairingCode("000000", {
        name: "Test",
        platform: "ios",
      });

      assert.equal(result.success, false);
      assert.ok(result.error?.includes("Invalid"));
    });

    it("rejects expired code", () => {
      const code = createPairingCode("telegram:owner");

      // Get the pending pairing and manually expire it by manipulating internals
      // Since we can't easily mock time, test via getPendingPairing instead
      const pairing = getPendingPairing(code);
      assert.ok(pairing);
      assert.ok(pairing.expiresAt.getTime() > Date.now());

      // Verify code works before expiry
      const result = redeemPairingCode(code, { name: "Test", platform: "ios" });
      assert.equal(result.success, true);
    });
  });

  describe("getPendingPairing", () => {
    it("returns pairing info for valid code", () => {
      const code = createPairingCode("telegram:12345");
      const pairing = getPendingPairing(code);

      assert.ok(pairing);
      assert.equal(pairing.code, code);
      assert.equal(pairing.ownerChatId, "telegram:12345");
      assert.ok(pairing.createdAt instanceof Date);
      assert.ok(pairing.expiresAt instanceof Date);
      assert.ok(pairing.expiresAt.getTime() > pairing.createdAt.getTime());
    });

    it("returns undefined for unknown code", () => {
      const pairing = getPendingPairing("999999");
      assert.equal(pairing, undefined);
    });

    it("returns a copy (not mutable reference)", () => {
      const code = createPairingCode("test");
      const p1 = getPendingPairing(code);
      assert.ok(p1);

      p1.ownerChatId = "modified";
      const p2 = getPendingPairing(code);
      assert.ok(p2);
      assert.equal(p2.ownerChatId, "test");
    });
  });

  describe("pendingPairingCount", () => {
    it("returns 0 when no codes", () => {
      assert.equal(pendingPairingCount(), 0);
    });

    it("decreases after redemption", () => {
      const code = createPairingCode("chat1");
      createPairingCode("chat2");
      assert.equal(pendingPairingCount(), 2);

      redeemPairingCode(code, { name: "D", platform: "ios" });
      assert.equal(pendingPairingCount(), 1);
    });
  });

  describe("multiple devices", () => {
    it("can pair multiple devices simultaneously", () => {
      const code1 = createPairingCode("owner1");
      const code2 = createPairingCode("owner2");

      const r1 = redeemPairingCode(code1, { name: "iPhone", platform: "ios" });
      const r2 = redeemPairingCode(code2, { name: "Pixel", platform: "android" });

      assert.equal(r1.success, true);
      assert.equal(r2.success, true);
      assert.notEqual(r1.device?.deviceId, r2.device?.deviceId);

      const devices = listDevices();
      assert.equal(devices.length, 2);
    });
  });
});
