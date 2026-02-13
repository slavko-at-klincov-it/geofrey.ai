import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { discoverHueBridgeNupnp } from "./discovery.js";

describe("discovery", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  // Note: SSDP tests would require UDP socket mocking which is complex.
  // We test the HTTP fallback (meethue.com) instead.

  it("discoverHueBridgeNupnp returns IP from meethue.com", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => [{ internalipaddress: "192.168.1.100" }],
    })) as unknown as typeof fetch;

    const ip = await discoverHueBridgeNupnp();
    assert.equal(ip, "192.168.1.100");
  });

  it("discoverHueBridgeNupnp returns null on empty response", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => [],
    })) as unknown as typeof fetch;

    const ip = await discoverHueBridgeNupnp();
    assert.equal(ip, null);
  });

  it("discoverHueBridgeNupnp returns null on API error", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 500,
    })) as unknown as typeof fetch;

    const ip = await discoverHueBridgeNupnp();
    assert.equal(ip, null);
  });

  it("discoverHueBridgeNupnp returns null on network error", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("Network error");
    }) as unknown as typeof fetch;

    const ip = await discoverHueBridgeNupnp();
    assert.equal(ip, null);
  });
});
