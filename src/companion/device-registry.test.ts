import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  registerDevice,
  unregisterDevice,
  getDevice,
  listDevices,
  updatePushToken,
  clearDevices,
  type Device,
} from "./device-registry.js";

describe("device-registry", () => {
  beforeEach(() => {
    clearDevices();
  });

  it("registers and retrieves a device", () => {
    const device: Device = {
      id: "d1",
      name: "iPhone 15",
      platform: "ios",
      paired: true,
      createdAt: new Date(),
    };
    registerDevice(device);
    assert.deepEqual(getDevice("d1"), device);
  });

  it("returns undefined for unknown device", () => {
    assert.equal(getDevice("unknown"), undefined);
  });

  it("lists all devices", () => {
    registerDevice({ id: "d1", name: "iPhone", platform: "ios", paired: true, createdAt: new Date() });
    registerDevice({ id: "d2", name: "Pixel", platform: "android", paired: true, createdAt: new Date() });
    assert.equal(listDevices().length, 2);
  });

  it("unregisters a device", () => {
    registerDevice({ id: "d1", name: "iPhone", platform: "ios", paired: true, createdAt: new Date() });
    assert.equal(unregisterDevice("d1"), true);
    assert.equal(getDevice("d1"), undefined);
  });

  it("returns false when unregistering unknown device", () => {
    assert.equal(unregisterDevice("unknown"), false);
  });

  it("updates push token", () => {
    registerDevice({ id: "d1", name: "iPhone", platform: "ios", paired: true, createdAt: new Date() });
    updatePushToken("d1", "new-token");
    assert.equal(getDevice("d1")!.pushToken, "new-token");
  });

  it("returns false when updating token for unknown device", () => {
    assert.equal(updatePushToken("unknown", "token"), false);
  });
});
