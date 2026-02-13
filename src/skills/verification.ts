import { createHash } from "node:crypto";

/**
 * Compute SHA-256 hash of a string content.
 */
export function computeSha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Verify that content matches the expected SHA-256 hash.
 * Returns { valid: true } or { valid: false, reason } with details.
 */
export function verifyHash(
  content: string,
  expectedHash: string,
): { valid: true } | { valid: false; reason: string } {
  const trimmedExpected = expectedHash.trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(trimmedExpected)) {
    return { valid: false, reason: `Invalid SHA-256 hash format: "${trimmedExpected}"` };
  }

  const computed = computeSha256(content);

  if (computed !== trimmedExpected) {
    return {
      valid: false,
      reason: `Hash mismatch — expected ${trimmedExpected}, got ${computed}`,
    };
  }

  return { valid: true };
}

/**
 * Parse a checksum file that may contain just a hash or a "hash  filename" format.
 * Extracts the first 64-character hex string found.
 */
export function parseChecksumFile(checksumContent: string): string | null {
  const trimmed = checksumContent.trim();

  // Try "hash  filename" format (sha256sum output)
  const match = trimmed.match(/^([a-f0-9]{64})\s/i);
  if (match) return match[1].toLowerCase();

  // Try bare hash
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return trimmed.toLowerCase();

  return null;
}
