import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  generatePairingCode,
  createPairing,
  verifyPairing,
  cleanExpired,
  getPairingCount,
  clearPairings,
} from "./pairing.js";

describe("pairing", () => {
  beforeEach(() => {
    clearPairings();
  });

  it("generates 6-digit code", () => {
    const code = generatePairingCode();
    assert.match(code, /^\d{6}$/);
  });

  it("creates and verifies pairing", () => {
    const code = createPairing("device-1");
    assert.equal(getPairingCount(), 1);
    const deviceId = verifyPairing(code);
    assert.equal(deviceId, "device-1");
    // Code should be consumed (one-time use)
    assert.equal(getPairingCount(), 0);
  });

  it("returns null for unknown code", () => {
    assert.equal(verifyPairing("000000"), null);
  });

  it("returns null for expired code", () => {
    const code = createPairing("device-1", 1); // 1ms TTL
    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    assert.equal(verifyPairing(code), null);
  });

  it("cleans expired entries", () => {
    createPairing("device-1", 1); // 1ms TTL
    createPairing("device-2", 1);
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }
    const cleaned = cleanExpired();
    assert.ok(cleaned >= 2);
    assert.equal(getPairingCount(), 0);
  });
});
