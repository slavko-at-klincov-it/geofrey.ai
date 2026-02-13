import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  registerDevice,
  getDevice,
  getDeviceByChatId,
  listDevices,
  removeDevice,
  updateLastSeen,
  updatePushToken,
  setDeviceOnline,
  getOfflineDevicesWithPush,
  _testClearAll,
  deviceSchema,
} from "./device-registry.js";

describe("device-registry", () => {
  beforeEach(() => {
    _testClearAll();
  });

  describe("registerDevice", () => {
    it("creates a device with generated ID and chatId", () => {
      const device = registerDevice({
        name: "My iPhone",
        platform: "ios",
      });

      assert.ok(device.deviceId);
      assert.equal(device.name, "My iPhone");
      assert.equal(device.platform, "ios");
      assert.equal(device.pushProvider, "apns");
      assert.ok(device.chatId.startsWith("companion:"));
      assert.ok(device.pairedAt instanceof Date);
      assert.ok(device.lastSeenAt instanceof Date);
      assert.equal(device.online, true);
    });

    it("assigns FCM provider for Android", () => {
      const device = registerDevice({
        name: "Pixel",
        platform: "android",
      });

      assert.equal(device.pushProvider, "fcm");
    });

    it("assigns APNS provider for macOS", () => {
      const device = registerDevice({
        name: "MacBook",
        platform: "macos",
      });

      assert.equal(device.pushProvider, "apns");
    });

    it("stores optional push token", () => {
      const device = registerDevice({
        name: "Test",
        platform: "ios",
        pushToken: "abc123token",
      });

      assert.equal(device.pushToken, "abc123token");
    });

    it("generates unique device IDs", () => {
      const d1 = registerDevice({ name: "D1", platform: "ios" });
      const d2 = registerDevice({ name: "D2", platform: "ios" });

      assert.notEqual(d1.deviceId, d2.deviceId);
      assert.notEqual(d1.chatId, d2.chatId);
    });
  });

  describe("getDevice", () => {
    it("returns device by ID", () => {
      const created = registerDevice({ name: "Test", platform: "ios" });
      const found = getDevice(created.deviceId);

      assert.ok(found);
      assert.equal(found.deviceId, created.deviceId);
      assert.equal(found.name, "Test");
    });

    it("returns undefined for unknown ID", () => {
      const found = getDevice("nonexistent");
      assert.equal(found, undefined);
    });

    it("returns a copy (not mutable reference)", () => {
      const created = registerDevice({ name: "Original", platform: "ios" });
      const found = getDevice(created.deviceId);
      assert.ok(found);

      found.name = "Modified";
      const again = getDevice(created.deviceId);
      assert.ok(again);
      assert.equal(again.name, "Original");
    });
  });

  describe("getDeviceByChatId", () => {
    it("finds device by chat ID", () => {
      const created = registerDevice({ name: "Chat", platform: "android" });
      const found = getDeviceByChatId(created.chatId);

      assert.ok(found);
      assert.equal(found.deviceId, created.deviceId);
    });

    it("returns undefined for unknown chatId", () => {
      const found = getDeviceByChatId("companion:nonexistent");
      assert.equal(found, undefined);
    });
  });

  describe("listDevices", () => {
    it("returns empty array when no devices", () => {
      assert.deepEqual(listDevices(), []);
    });

    it("returns all registered devices", () => {
      registerDevice({ name: "D1", platform: "ios" });
      registerDevice({ name: "D2", platform: "android" });
      registerDevice({ name: "D3", platform: "macos" });

      const all = listDevices();
      assert.equal(all.length, 3);
      const names = all.map((d) => d.name).sort();
      assert.deepEqual(names, ["D1", "D2", "D3"]);
    });
  });

  describe("removeDevice", () => {
    it("removes existing device and returns true", () => {
      const d = registerDevice({ name: "ToRemove", platform: "ios" });
      const removed = removeDevice(d.deviceId);
      assert.equal(removed, true);

      const found = getDevice(d.deviceId);
      assert.equal(found, undefined);
    });

    it("returns false for nonexistent device", () => {
      const removed = removeDevice("nonexistent");
      assert.equal(removed, false);
    });
  });

  describe("updateLastSeen", () => {
    it("updates lastSeenAt and online status", () => {
      const d = registerDevice({ name: "Test", platform: "ios" });
      const originalLastSeen = d.lastSeenAt;

      // Small delay to ensure different timestamp
      const updated = updateLastSeen(d.deviceId, false);
      assert.equal(updated, true);

      const found = getDevice(d.deviceId);
      assert.ok(found);
      assert.equal(found.online, false);
      assert.ok(found.lastSeenAt.getTime() >= originalLastSeen.getTime());
    });

    it("returns false for unknown device", () => {
      const updated = updateLastSeen("nonexistent", true);
      assert.equal(updated, false);
    });
  });

  describe("updatePushToken", () => {
    it("updates push token", () => {
      const d = registerDevice({ name: "Test", platform: "ios" });
      const updated = updatePushToken(d.deviceId, "new-token-xyz");
      assert.equal(updated, true);

      const found = getDevice(d.deviceId);
      assert.ok(found);
      assert.equal(found.pushToken, "new-token-xyz");
    });

    it("returns false for unknown device", () => {
      const updated = updatePushToken("nonexistent", "token");
      assert.equal(updated, false);
    });
  });

  describe("setDeviceOnline", () => {
    it("sets device online and updates lastSeenAt", () => {
      const d = registerDevice({ name: "Test", platform: "ios" });
      setDeviceOnline(d.deviceId, false);

      const offline = getDevice(d.deviceId);
      assert.ok(offline);
      assert.equal(offline.online, false);

      setDeviceOnline(d.deviceId, true);
      const online = getDevice(d.deviceId);
      assert.ok(online);
      assert.equal(online.online, true);
    });

    it("returns false for unknown device", () => {
      assert.equal(setDeviceOnline("nonexistent", true), false);
    });
  });

  describe("getOfflineDevicesWithPush", () => {
    it("returns empty when no offline devices with push", () => {
      registerDevice({ name: "Online", platform: "ios", pushToken: "tok" });
      // Device starts online
      assert.deepEqual(getOfflineDevicesWithPush(), []);
    });

    it("returns offline devices that have push tokens", () => {
      const d1 = registerDevice({ name: "Offline+Push", platform: "ios", pushToken: "tok1" });
      const d2 = registerDevice({ name: "Offline-NoPush", platform: "ios" });
      const d3 = registerDevice({ name: "Online+Push", platform: "android", pushToken: "tok2" });

      setDeviceOnline(d1.deviceId, false);
      setDeviceOnline(d2.deviceId, false);
      // d3 stays online

      const offline = getOfflineDevicesWithPush();
      assert.equal(offline.length, 1);
      assert.equal(offline[0].deviceId, d1.deviceId);
    });
  });

  describe("deviceSchema", () => {
    it("validates a correct device object", () => {
      const d = registerDevice({ name: "Valid", platform: "ios" });
      const result = deviceSchema.safeParse(d);
      assert.equal(result.success, true);
    });

    it("rejects empty deviceId", () => {
      const result = deviceSchema.safeParse({
        deviceId: "",
        name: "Test",
        platform: "ios",
        chatId: "companion:x",
        pairedAt: new Date(),
        lastSeenAt: new Date(),
        online: true,
      });
      assert.equal(result.success, false);
    });

    it("rejects invalid platform", () => {
      const result = deviceSchema.safeParse({
        deviceId: "abc",
        name: "Test",
        platform: "windows",
        chatId: "companion:x",
        pairedAt: new Date(),
        lastSeenAt: new Date(),
        online: true,
      });
      assert.equal(result.success, false);
    });
  });
});
