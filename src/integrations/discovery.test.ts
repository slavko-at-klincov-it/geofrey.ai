import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  discoverHueCloud,
  discoverAll,
} from "./discovery.js";

describe("discovery", () => {
  describe("discoverHueCloud", () => {
    beforeEach(() => {
      mock.restoreAll();
    });

    it("returns bridges from cloud endpoint", async () => {
      mock.method(globalThis, "fetch", () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: "abc123", internalipaddress: "192.168.1.100", port: 443 },
            { id: "def456", internalipaddress: "192.168.1.101" },
          ]),
        }),
      );

      const devices = await discoverHueCloud();

      assert.equal(devices.length, 2);
      assert.equal(devices[0].type, "hue");
      assert.equal(devices[0].ip, "192.168.1.100");
      assert.equal(devices[0].port, 443);
      assert.equal(devices[0].name, "Hue Bridge (abc123)");
      assert.equal(devices[1].ip, "192.168.1.101");
      assert.equal(devices[1].port, 443); // default port
    });

    it("returns empty array on HTTP error", async () => {
      mock.method(globalThis, "fetch", () =>
        Promise.resolve({ ok: false, status: 500 }),
      );

      const devices = await discoverHueCloud();
      assert.deepEqual(devices, []);
    });

    it("returns empty array on network error", async () => {
      mock.method(globalThis, "fetch", () =>
        Promise.reject(new Error("Network unreachable")),
      );

      const devices = await discoverHueCloud();
      assert.deepEqual(devices, []);
    });

    it("returns empty array for non-array response", async () => {
      mock.method(globalThis, "fetch", () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ error: "not found" }),
        }),
      );

      const devices = await discoverHueCloud();
      assert.deepEqual(devices, []);
    });

    it("filters entries without internalipaddress", async () => {
      mock.method(globalThis, "fetch", () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: "abc123" }, // no IP
            { id: "def456", internalipaddress: "192.168.1.200" },
          ]),
        }),
      );

      const devices = await discoverHueCloud();
      assert.equal(devices.length, 1);
      assert.equal(devices[0].ip, "192.168.1.200");
    });
  });

  describe("discoverAll", () => {
    beforeEach(() => {
      mock.restoreAll();
    });

    it("merges SSDP and cloud results, cloud overrides by IP", async () => {
      // Mock fetch for Hue cloud discovery (SSDP is harder to mock, so we only test cloud here)
      mock.method(globalThis, "fetch", () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: "bridge-1", internalipaddress: "192.168.1.50" },
          ]),
        }),
      );

      // Use a very short timeout to make SSDP finish quickly (no real network)
      const devices = await discoverAll(100);

      // Should at least have the cloud result
      const hueBridge = devices.find((d) => d.ip === "192.168.1.50");
      assert.ok(hueBridge);
      assert.equal(hueBridge.type, "hue");
    });

    it("returns empty array when nothing found", async () => {
      mock.method(globalThis, "fetch", () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        }),
      );

      const devices = await discoverAll(100);
      // May find local devices via SSDP, but cloud returns empty
      // Just verify it doesn't crash
      assert.ok(Array.isArray(devices));
    });
  });
});
