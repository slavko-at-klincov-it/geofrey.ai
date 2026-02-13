import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { setSonosConfig, getZones, play, pause, setVolume } from "./sonos.js";

describe("sonos", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    setSonosConfig({ httpApiUrl: "http://localhost:5005" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("getZones returns parsed zones", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => [
        { coordinator: { roomName: "Living Room", state: { playbackState: "PLAYING", volume: 50 } } },
        { coordinator: { roomName: "Kitchen", state: { playbackState: "PAUSED", volume: 30 } } },
      ],
    })) as unknown as typeof fetch;

    const zones = await getZones();
    assert.equal(zones.length, 2);
    assert.equal(zones[0].name, "Living Room");
    assert.equal(zones[0].state, "PLAYING");
    assert.equal(zones[0].volume, 50);
  });

  it("play sends correct request", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return { ok: true } as Response;
    }) as typeof fetch;

    await play("Living Room");
    assert.ok(capturedUrl.includes("/Living%20Room/play"));
  });

  it("pause sends correct request", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return { ok: true } as Response;
    }) as typeof fetch;

    await pause("Kitchen");
    assert.ok(capturedUrl.includes("/Kitchen/pause"));
  });

  it("setVolume clamps to 0-100", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return { ok: true } as Response;
    }) as typeof fetch;

    await setVolume("Living Room", 150);
    assert.ok(capturedUrl.includes("/volume/100"));

    await setVolume("Living Room", -10);
    assert.ok(capturedUrl.includes("/volume/0"));
  });

  it("throws when config not set", async () => {
    setSonosConfig(null as any);
    await assert.rejects(() => getZones());
  });
});
