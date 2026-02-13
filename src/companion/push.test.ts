import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { setPushConfig, sendFcm, sendPush } from "./push.js";
import type { Device } from "./device-registry.js";

describe("push", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  describe("sendFcm", () => {
    it("sends FCM notification", async () => {
      setPushConfig({ fcmServerKey: "test-fcm-key" });
      let capturedBody = "";
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
        capturedHeaders = Object.fromEntries(
          Object.entries(opts?.headers ?? {}),
        ) as Record<string, string>;
        capturedBody = opts?.body as string;
        return { ok: true } as Response;
      }) as typeof fetch;

      const result = await sendFcm("device-token", { title: "Hello", body: "World" });
      assert.equal(result, true);
      assert.equal(capturedHeaders["Authorization"], "key=test-fcm-key");
      const body = JSON.parse(capturedBody);
      assert.equal(body.to, "device-token");
      assert.equal(body.notification.title, "Hello");
    });

    it("throws when FCM not configured", async () => {
      setPushConfig({});
      await assert.rejects(() => sendFcm("token", { title: "Hi", body: "Hey" }));
    });

    it("returns false on API error", async () => {
      setPushConfig({ fcmServerKey: "key" });
      globalThis.fetch = mock.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch;
      const result = await sendFcm("token", { title: "Hi", body: "Hey" });
      assert.equal(result, false);
    });
  });

  describe("sendPush", () => {
    it("routes android to FCM", async () => {
      setPushConfig({ fcmServerKey: "key" });
      globalThis.fetch = mock.fn(async () => ({ ok: true })) as unknown as typeof fetch;

      const device: Device = {
        id: "d1",
        name: "Pixel",
        platform: "android",
        pushToken: "android-token",
        paired: true,
        createdAt: new Date(),
      };
      const result = await sendPush(device, { title: "Hi", body: "Test" });
      assert.equal(result, true);
    });

    it("throws when device has no push token", async () => {
      const device: Device = {
        id: "d1",
        name: "Pixel",
        platform: "android",
        paired: true,
        createdAt: new Date(),
      };
      await assert.rejects(
        () => sendPush(device, { title: "Hi", body: "Test" }),
        (err: Error) => err.message.includes("no push token"),
      );
    });
  });
});
