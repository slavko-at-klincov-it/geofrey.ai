import { randomInt } from "node:crypto";
import {
  registerDevice,
  type DeviceCreateInput,
  type Device,
} from "./device-registry.js";

// ── Constants ──────────────────────────────────────────────────────────────

const PAIRING_CODE_LENGTH = 6;
const PAIRING_CODE_TTL_MS = 5 * 60 * 1_000; // 5 minutes
const MAX_PENDING_CODES = 50;

// ── Types ──────────────────────────────────────────────────────────────────

export interface PendingPairing {
  code: string;
  createdAt: Date;
  expiresAt: Date;
  ownerChatId: string;
}

export interface PairingResult {
  success: boolean;
  device?: Device;
  error?: string;
}

// ── Internal state ─────────────────────────────────────────────────────────

const pendingCodes = new Map<string, PendingPairing>();

// Cleanup expired codes periodically
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [code, pairing] of pendingCodes) {
      if (now > pairing.expiresAt.getTime()) {
        pendingCodes.delete(code);
      }
    }
  }, 30_000);
  // Don't block process shutdown
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generatePairingCode(): string {
  // 6-digit numeric code (100000–999999)
  const code = randomInt(100_000, 1_000_000);
  return String(code);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a new pairing code.
 * Called when user sends "companion pair" in an existing chat.
 * Returns the 6-digit code to display to the user.
 */
export function createPairingCode(ownerChatId: string): string {
  startCleanup();

  // Limit pending codes to prevent abuse
  if (pendingCodes.size >= MAX_PENDING_CODES) {
    // Remove oldest expired first
    const now = Date.now();
    for (const [code, pairing] of pendingCodes) {
      if (now > pairing.expiresAt.getTime()) {
        pendingCodes.delete(code);
      }
    }
    // If still too many, remove oldest
    if (pendingCodes.size >= MAX_PENDING_CODES) {
      const oldest = Array.from(pendingCodes.entries())
        .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
      if (oldest.length > 0) {
        pendingCodes.delete(oldest[0][0]);
      }
    }
  }

  // Generate unique code
  let code: string;
  do {
    code = generatePairingCode();
  } while (pendingCodes.has(code));

  const now = new Date();
  const pairing: PendingPairing = {
    code,
    createdAt: now,
    expiresAt: new Date(now.getTime() + PAIRING_CODE_TTL_MS),
    ownerChatId,
  };

  pendingCodes.set(code, pairing);
  return code;
}

/**
 * Validate a pairing code and register the device.
 * Called when companion app connects with a pairing code.
 */
export function redeemPairingCode(
  code: string,
  deviceInput: DeviceCreateInput,
): PairingResult {
  const pairing = pendingCodes.get(code);

  if (!pairing) {
    return { success: false, error: "Invalid pairing code" };
  }

  if (Date.now() > pairing.expiresAt.getTime()) {
    pendingCodes.delete(code);
    return { success: false, error: "Pairing code expired" };
  }

  // Code is valid — consume it
  pendingCodes.delete(code);

  // Register the device
  const device = registerDevice(deviceInput);

  return { success: true, device };
}

/**
 * Get a pending pairing by code (for inspection).
 */
export function getPendingPairing(code: string): PendingPairing | undefined {
  const pairing = pendingCodes.get(code);
  if (!pairing) return undefined;

  // Check expiry
  if (Date.now() > pairing.expiresAt.getTime()) {
    pendingCodes.delete(code);
    return undefined;
  }

  return { ...pairing };
}

/**
 * Count pending pairing codes.
 */
export function pendingPairingCount(): number {
  return pendingCodes.size;
}

/**
 * Shutdown cleanup timer.
 */
export function shutdownPairing(): void {
  stopCleanup();
  pendingCodes.clear();
}

/** Clear all state (for testing) */
export function _testClearAll(): void {
  pendingCodes.clear();
  stopCleanup();
}
