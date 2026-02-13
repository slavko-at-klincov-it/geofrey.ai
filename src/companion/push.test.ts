import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPushDispatcher,
  _testResetTokenCaches,
  type PushConfig,
  type PushPayload,
} from "./push.js";
import type { Device } from "./device-registry.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    deviceId: "dev-1",
    name: "Test Device",
    platform: "ios",
    chatId: "companion:dev-1",
    pairedAt: new Date(),
    lastSeenAt: new Date(),
    online: false,
    pushProvider: "apns",
    ...overrides,
  };
}

const TEST_PAYLOAD: PushPayload = {
  title: "Test",
  body: "Hello from test",
};

describe("push dispatcher", () => {
  it("creates a dispatcher without config", () => {
    const dispatcher = createPushDispatcher({});
    assert.ok(dispatcher);
    assert.equal(typeof dispatcher.sendPush, "function");
    assert.equal(typeof dispatcher.sendPushToOffline, "function");
    assert.equal(typeof dispatcher.isConfigured, "function");
  });

  describe("isConfigured", () => {
    it("returns false with no providers", () => {
      const dispatcher = createPushDispatcher({});
      assert.equal(dispatcher.isConfigured(), false);
    });

    it("returns true with APNS config", () => {
      const dispatcher = createPushDispatcher({
        apns: {
          keyId: "KEY123",
          teamId: "TEAM123",
          bundleId: "com.test.app",
          privateKey: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
        },
      });
      assert.equal(dispatcher.isConfigured(), true);
    });

    it("returns true with FCM config", () => {
      const dispatcher = createPushDispatcher({
        fcm: {
          projectId: "my-project",
          serviceAccountKey: JSON.stringify({ client_email: "test@test.iam.gserviceaccount.com", private_key: "fake", token_uri: "https://oauth2.googleapis.com/token" }),
        },
      });
      assert.equal(dispatcher.isConfigured(), true);
    });
  });

  describe("sendPush", () => {
    it("returns error when device has no push token", async () => {
      const dispatcher = createPushDispatcher({});
      const device = makeDevice({ pushToken: undefined });

      const result = await dispatcher.sendPush(device, TEST_PAYLOAD);
      assert.equal(result.success, false);
      assert.ok(result.error?.includes("No push token"));
      assert.equal(result.deviceId, "dev-1");
    });

    it("returns error when APNS is not configured", async () => {
      const dispatcher = createPushDispatcher({});
      const device = makeDevice({
        pushToken: "apns-token",
        pushProvider: "apns",
      });

      const result = await dispatcher.sendPush(device, TEST_PAYLOAD);
      assert.equal(result.success, false);
      assert.ok(result.error?.includes("APNS not configured"));
    });

    it("returns error when FCM is not configured", async () => {
      const dispatcher = createPushDispatcher({});
      const device = makeDevice({
        pushToken: "fcm-token",
        pushProvider: "fcm",
        platform: "android",
      });

      const result = await dispatcher.sendPush(device, TEST_PAYLOAD);
      assert.equal(result.success, false);
      assert.ok(result.error?.includes("FCM not configured"));
    });

    it("returns error for unknown push provider", async () => {
      const dispatcher = createPushDispatcher({});
      const device = makeDevice({
        pushToken: "token",
        pushProvider: undefined,
      });

      const result = await dispatcher.sendPush(device, TEST_PAYLOAD);
      // No push token or unknown provider
      assert.equal(result.success, false);
    });
  });

  describe("sendPushToOffline", () => {
    it("returns empty array when no eligible devices", async () => {
      const dispatcher = createPushDispatcher({});
      const results = await dispatcher.sendPushToOffline([], TEST_PAYLOAD);
      assert.deepEqual(results, []);
    });

    it("filters out devices without push tokens", async () => {
      const dispatcher = createPushDispatcher({});
      const devices = [
        makeDevice({ deviceId: "d1", pushToken: undefined }),
        makeDevice({ deviceId: "d2", pushToken: undefined }),
      ];

      const results = await dispatcher.sendPushToOffline(devices, TEST_PAYLOAD);
      assert.deepEqual(results, []);
    });

    it("attempts push for devices with tokens", async () => {
      const dispatcher = createPushDispatcher({});
      const devices = [
        makeDevice({ deviceId: "d1", pushToken: "tok1", pushProvider: "apns" }),
        makeDevice({ deviceId: "d2", pushToken: "tok2", pushProvider: "fcm", platform: "android" }),
      ];

      const results = await dispatcher.sendPushToOffline(devices, TEST_PAYLOAD);
      // Both should fail because no providers configured
      assert.equal(results.length, 2);
      assert.equal(results[0].success, false);
      assert.equal(results[1].success, false);
    });
  });

  describe("token cache reset", () => {
    it("resets without error", () => {
      // Just verify it doesn't throw
      _testResetTokenCaches();
    });
  });
});
