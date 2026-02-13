import { randomInt } from "node:crypto";

export interface PairingEntry {
  deviceId: string;
  expiresAt: number;
}

const pairings = new Map<string, PairingEntry>();

const DEFAULT_TTL_MS = 300_000; // 5 minutes

/**
 * Generate a 6-digit pairing code.
 */
export function generatePairingCode(): string {
  return String(randomInt(100_000, 999_999));
}

/**
 * Create a pairing entry for a device.
 */
export function createPairing(deviceId: string, ttlMs = DEFAULT_TTL_MS): string {
  cleanExpired();
  const code = generatePairingCode();
  pairings.set(code, {
    deviceId,
    expiresAt: Date.now() + ttlMs,
  });
  return code;
}

/**
 * Verify a pairing code. Returns deviceId if valid, null if expired/invalid.
 * Deletes the code on use (one-time).
 */
export function verifyPairing(code: string): string | null {
  const entry = pairings.get(code);
  if (!entry) return null;
  pairings.delete(code);
  if (Date.now() > entry.expiresAt) return null;
  return entry.deviceId;
}

/**
 * Clean expired pairing codes.
 */
export function cleanExpired(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [code, entry] of pairings) {
    if (now > entry.expiresAt) {
      pairings.delete(code);
      cleaned++;
    }
  }
  return cleaned;
}

export function getPairingCount(): number {
  return pairings.size;
}

export function clearPairings(): void {
  pairings.clear();
}
