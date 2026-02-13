import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { setHaConfig, getStates, callService, getServices } from "./homeassistant.js";

describe("homeassistant", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    setHaConfig({ url: "http://localhost:8123", token: "test-token" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("getStates returns entity states", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => [
        { entity_id: "light.living_room", state: "on", attributes: {}, last_changed: "2026-01-01" },
        { entity_id: "switch.kitchen", state: "off", attributes: {}, last_changed: "2026-01-01" },
      ],
    })) as unknown as typeof fetch;

    const states = await getStates();
    assert.equal(states.length, 2);
    assert.equal(states[0].entity_id, "light.living_room");
  });

  it("callService sends POST with entity_id", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request, opts?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = opts?.body as string;
      return { ok: true } as Response;
    }) as typeof fetch;

    await callService("light", "turn_on", "light.living_room", { brightness: 255 });
    assert.ok(capturedUrl.includes("/api/services/light/turn_on"));
    const body = JSON.parse(capturedBody);
    assert.equal(body.entity_id, "light.living_room");
    assert.equal(body.brightness, 255);
  });

  it("getServices returns domain list", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => [
        { domain: "light", services: { turn_on: {}, turn_off: {} } },
        { domain: "switch", services: { toggle: {} } },
      ],
    })) as unknown as typeof fetch;

    const services = await getServices();
    assert.equal(services.length, 2);
    assert.deepEqual(services[0].services, ["turn_on", "turn_off"]);
  });

  it("throws when config not set", async () => {
    setHaConfig(null as any);
    await assert.rejects(() => getStates());
  });
});
