import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { setHueConfig, getLights, setLightState } from "../../integrations/hue.js";
import { setHaConfig, getStates, callService } from "../../integrations/homeassistant.js";
import { setSonosConfig, getZones } from "../../integrations/sonos.js";
import { discoverSsdp, discoverAll } from "../../integrations/discovery.js";

describe("E2E: Smart Home Integrations (graceful failure)", { timeout: 30_000 }, () => {
  // ── Hue ──────────────────────────────────────────────────────────────

  describe("Philips Hue", () => {
    it("setHueConfig accepts valid config without error", () => {
      assert.doesNotThrow(() => {
        setHueConfig({
          bridgeIp: "192.168.1.50",
          apiKey: "test-hue-api-key-abcdef1234567890",
        });
      });
    });

    it("getLights fails gracefully without real bridge", async () => {
      setHueConfig({
        bridgeIp: "127.0.0.1:1",
        apiKey: "fake-key-for-testing",
      });

      await assert.rejects(
        () => getLights(),
        (err: Error) => {
          // Should be a connection/fetch error, not an unhandled crash
          assert.ok(
            err instanceof Error,
            `Expected an Error instance, got ${typeof err}`,
          );
          assert.ok(
            err.message.length > 0,
            "Error should have a meaningful message",
          );
          return true;
        },
      );
    });

    it("setLightState fails gracefully without real bridge", async () => {
      setHueConfig({
        bridgeIp: "127.0.0.1:1",
        apiKey: "fake-key-for-testing",
      });

      await assert.rejects(
        () => setLightState("light-001", { on: true, brightness: 80 }),
        (err: Error) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.length > 0);
          return true;
        },
      );
    });
  });

  // ── HomeAssistant ────────────────────────────────────────────────────

  describe("HomeAssistant", () => {
    it("setHaConfig accepts valid config without error", () => {
      assert.doesNotThrow(() => {
        setHaConfig({
          url: "http://homeassistant.local:8123",
          token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-ha-token",
        });
      });
    });

    it("getStates fails gracefully without real server", async () => {
      setHaConfig({
        url: "http://127.0.0.1:1",
        token: "fake-ha-token-for-testing",
      });

      await assert.rejects(
        () => getStates(),
        (err: Error) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.length > 0);
          return true;
        },
      );
    });

    it("callService fails gracefully without real server", async () => {
      setHaConfig({
        url: "http://127.0.0.1:1",
        token: "fake-ha-token-for-testing",
      });

      await assert.rejects(
        () => callService("light", "turn_on", "light.wohnzimmer", { brightness: 200 }),
        (err: Error) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.length > 0);
          return true;
        },
      );
    });
  });

  // ── Sonos ────────────────────────────────────────────────────────────

  describe("Sonos", () => {
    it("setSonosConfig accepts valid config without error", () => {
      assert.doesNotThrow(() => {
        setSonosConfig({
          httpApiUrl: "http://192.168.1.100:5005",
        });
      });
    });

    it("getZones fails gracefully without real Sonos HTTP API", async () => {
      setSonosConfig({
        httpApiUrl: "http://127.0.0.1:1",
      });

      await assert.rejects(
        () => getZones(),
        (err: Error) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.length > 0);
          return true;
        },
      );
    });
  });

  // ── Discovery ────────────────────────────────────────────────────────

  describe("Device Discovery", () => {
    it("discoverSsdp does not crash with short timeout and no devices", async () => {
      // 500ms timeout — unlikely to find anything, but should return gracefully
      const devices = await discoverSsdp("ssdp:all", 500);
      assert.ok(Array.isArray(devices), "Should return an array");
      // We don't assert empty — CI might have UPnP devices on the network
    });

    it("discoverAll returns structured results without crash", async () => {
      const results = await discoverAll();
      assert.ok(
        typeof results === "object" && results !== null,
        "Should return an object",
      );
      assert.ok("hue" in results, "Results should have a 'hue' field");
      assert.ok("sonos" in results, "Results should have a 'sonos' field");
      assert.ok(
        results.hue === null || typeof results.hue === "string",
        "hue should be null or a string IP",
      );
      assert.ok(
        Array.isArray(results.sonos),
        "sonos should be an array of IPs",
      );
    });
  });
});
