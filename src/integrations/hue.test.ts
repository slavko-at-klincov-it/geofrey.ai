import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { setHueConfig, getLights, setLightState, getScenes, activateScene } from "./hue.js";

describe("hue", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    setHueConfig({ bridgeIp: "192.168.1.100", apiKey: "test-key" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("getLights returns parsed light list", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: "l1", metadata: { name: "Living Room" }, on: { on: true }, dimming: { brightness: 80 } },
          { id: "l2", metadata: { name: "Bedroom" }, on: { on: false } },
        ],
      }),
    })) as unknown as typeof fetch;

    const lights = await getLights();
    assert.equal(lights.length, 2);
    assert.equal(lights[0].name, "Living Room");
    assert.equal(lights[0].on, true);
    assert.equal(lights[0].brightness, 80);
    assert.equal(lights[1].on, false);
  });

  it("setLightState sends correct PUT request", async () => {
    let capturedMethod = "";
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedMethod = opts?.method ?? "";
      capturedBody = opts?.body as string;
      return { ok: true } as Response;
    }) as typeof fetch;

    const ok = await setLightState("l1", { on: true, brightness: 50 });
    assert.equal(ok, true);
    assert.equal(capturedMethod, "PUT");
    const body = JSON.parse(capturedBody);
    assert.deepEqual(body.on, { on: true });
    assert.deepEqual(body.dimming, { brightness: 50 });
  });

  it("getScenes returns parsed scene list", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: "s1", metadata: { name: "Relax" } },
          { id: "s2", metadata: { name: "Energize" } },
        ],
      }),
    })) as unknown as typeof fetch;

    const scenes = await getScenes();
    assert.equal(scenes.length, 2);
    assert.equal(scenes[0].name, "Relax");
  });

  it("activateScene sends recall action", async () => {
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body as string;
      return { ok: true } as Response;
    }) as typeof fetch;

    await activateScene("s1");
    const body = JSON.parse(capturedBody);
    assert.deepEqual(body.recall, { action: "active" });
  });

  it("throws when config not set", async () => {
    setHueConfig(null as any);
    // Reset to trigger error
    await assert.rejects(() => getLights(), (err: Error) => {
      assert.ok(err.message.includes("not configured"));
      return true;
    });
  });
});
