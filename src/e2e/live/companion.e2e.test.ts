import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  registerDevice,
  getDevice,
  listDevices,
  unregisterDevice,
  clearDevices,
  type Device,
} from "../../companion/device-registry.js";
import {
  generatePairingCode,
  createPairing,
  verifyPairing,
  clearPairings,
} from "../../companion/pairing.js";
import { startCompanionServer, type CompanionServer } from "../../companion/ws-server.js";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";

describe("E2E: Companion Apps (device registry, pairing, WebSocket)", { timeout: 30_000 }, () => {
  let env: TestEnv;

  before(async () => {
    env = await createTestEnv();
  });

  after(async () => {
    clearDevices();
    clearPairings();
    await env.cleanup();
  });

  it("device registry CRUD", () => {
    clearDevices();

    const device: Device = {
      id: "iphone-max-01",
      name: "Max sein iPhone",
      platform: "ios",
      pushToken: "apns-token-abc123",
      paired: true,
      createdAt: new Date(),
    };

    // Create
    registerDevice(device);

    // Read
    const retrieved = getDevice("iphone-max-01");
    assert.ok(retrieved, "getDevice should return the registered device");
    assert.equal(retrieved.id, "iphone-max-01");
    assert.equal(retrieved.name, "Max sein iPhone");
    assert.equal(retrieved.platform, "ios");
    assert.equal(retrieved.pushToken, "apns-token-abc123");
    assert.equal(retrieved.paired, true);

    // List
    const all = listDevices();
    assert.ok(all.length >= 1, "listDevices should include the registered device");
    const found = all.find((d) => d.id === "iphone-max-01");
    assert.ok(found, "Device should appear in listDevices()");

    // Delete
    const removed = unregisterDevice("iphone-max-01");
    assert.equal(removed, true, "unregisterDevice should return true for existing device");

    // Verify gone
    const afterRemove = getDevice("iphone-max-01");
    assert.equal(afterRemove, undefined, "Device should be gone after unregisterDevice");

    // Double-delete returns false
    const removedAgain = unregisterDevice("iphone-max-01");
    assert.equal(removedAgain, false, "unregisterDevice should return false for nonexistent device");
  });

  it("generatePairingCode returns 6-digit string", () => {
    const code = generatePairingCode();

    assert.ok(typeof code === "string", "Code should be a string");
    assert.match(code, /^\d{6}$/, `Code should be exactly 6 digits, got: "${code}"`);

    // Generate multiple codes to verify randomness
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      codes.add(generatePairingCode());
    }
    assert.ok(codes.size > 1, "Multiple generated codes should not all be identical");
  });

  it("validatePairingCode accepts valid code", () => {
    clearPairings();

    const code = createPairing("device-valid-01", 300_000);
    assert.ok(code, "createPairing should return a code");

    const deviceId = verifyPairing(code);
    assert.equal(deviceId, "device-valid-01", "verifyPairing should return the device ID");

    // Code is one-time use — second verification should fail
    const secondAttempt = verifyPairing(code);
    assert.equal(secondAttempt, null, "Code should be consumed after first verification");
  });

  it("isPairingExpired returns false for fresh code", () => {
    clearPairings();

    const code = createPairing("device-fresh-01", 300_000);

    // A fresh code should be verifiable (not expired)
    const deviceId = verifyPairing(code);
    assert.equal(deviceId, "device-fresh-01", "Fresh pairing code should be valid");
  });

  it("isPairingExpired returns true for old code", async () => {
    clearPairings();

    // Create pairing with 1ms TTL — expires almost immediately
    const code = createPairing("device-expired-01", 1);

    // Wait long enough for Date.now() to exceed expiresAt
    await new Promise((r) => setTimeout(r, 20));

    const deviceId = verifyPairing(code);
    assert.equal(deviceId, null, "Expired pairing code should return null");
  });

  it("WebSocket server starts and stops", async () => {
    const wsPort = 40_000 + Math.floor(Math.random() * 10_000);

    let server: CompanionServer | undefined;
    try {
      server = await startCompanionServer({
        wsPort,
        pairingTtlMs: 300_000,
        heartbeatIntervalMs: 60_000, // Long interval to avoid timer noise during test
      });

      assert.ok(server, "startCompanionServer should return a server object");
      assert.equal(typeof server.stop, "function", "Server should have a stop method");
      assert.equal(typeof server.getConnections, "function", "Server should have getConnections");
      assert.equal(typeof server.broadcast, "function", "Server should have broadcast");
      assert.equal(server.getConnections(), 0, "Fresh server should have 0 connections");
    } finally {
      if (server) {
        await server.stop();
      }
    }

    // After stop, we verify it completed without throwing.
    // Starting another server on the same port should work since the first was closed.
    let server2: CompanionServer | undefined;
    try {
      server2 = await startCompanionServer({
        wsPort,
        pairingTtlMs: 300_000,
        heartbeatIntervalMs: 60_000,
      });
      assert.ok(server2, "Should be able to start a new server on the same port after stop");
    } finally {
      if (server2) {
        await server2.stop();
      }
    }
  });
});
