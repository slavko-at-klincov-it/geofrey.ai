import sharp from "sharp";
import type { AuditEntry } from "../audit/audit-log.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type SupportedFormat = "jpeg" | "png" | "webp" | "tiff" | "gif";

export interface SuspiciousFinding {
  field: string;
  snippet: string;
  pattern: string;
}

export interface SanitizationReport {
  originalSize: number;
  sanitizedSize: number;
  format: SupportedFormat;
  orientationApplied: boolean;
  metadataStripped: boolean;
  suspiciousFindings: SuspiciousFinding[];
  durationMs: number;
}

export interface SanitizeResult {
  buffer: Buffer;
  report: SanitizationReport;
}

export type ImageSanitizeErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "CORRUPT_IMAGE"
  | "SIZE_EXCEEDED"
  | "PROCESSING_FAILED";

export class ImageSanitizeError extends Error {
  constructor(
    public readonly code: ImageSanitizeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageSanitizeError";
  }
}

// ── Magic bytes for format detection ───────────────────────────────────────

const MAGIC_BYTES: Array<{ format: SupportedFormat; bytes: number[] }> = [
  { format: "jpeg", bytes: [0xff, 0xd8, 0xff] },
  { format: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { format: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { format: "webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF" — WebP starts RIFF....WEBP
  { format: "tiff", bytes: [0x49, 0x49, 0x2a, 0x00] }, // little-endian TIFF
  { format: "tiff", bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // big-endian TIFF
];

// ── Injection detection patterns ───────────────────────────────────────────
// Duplicated from mcp-client.ts (can't import — side effects via tool-registry chain)
// plus metadata-specific patterns

const INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(?:you must|you should|please|i need you to|execute|run the command|call the tool)\b/gi, label: "instruction" },
  { pattern: /<\/?(?:system|instruction|prompt|command|tool_call)[^>]*>/gi, label: "xml-injection" },
  { pattern: /ignore previous instructions/gi, label: "ignore-previous" },
  { pattern: /new system prompt/gi, label: "new-system-prompt" },
  { pattern: /(?:^|\b)act as\b/gi, label: "act-as" },
  { pattern: /\bjailbreak\b/gi, label: "jailbreak" },
  { pattern: /\bDAN\b/, label: "DAN-jailbreak" },
  { pattern: /disregard (?:all |any )?(?:previous |prior )?(?:instructions|rules)/gi, label: "disregard-instructions" },
  { pattern: /\bdo not follow\b.*\brules\b/gi, label: "bypass-rules" },
];

// ── Public API ─────────────────────────────────────────────────────────────

export function detectFormat(buffer: Buffer): SupportedFormat | null {
  if (buffer.length < 4) return null;

  for (const { format, bytes } of MAGIC_BYTES) {
    if (bytes.every((b, i) => buffer[i] === b)) {
      // WebP needs extra check: bytes 8-11 must be "WEBP"
      if (format === "webp") {
        if (buffer.length < 12) return null;
        const tag = buffer.subarray(8, 12).toString("ascii");
        if (tag !== "WEBP") return null;
      }
      return format;
    }
  }
  return null;
}

export function scanMetadataForInjection(
  rawBuffers: { exif?: Buffer; xmp?: Buffer; iptc?: Buffer },
): SuspiciousFinding[] {
  const findings: SuspiciousFinding[] = [];

  for (const [field, buf] of Object.entries(rawBuffers)) {
    if (!buf || buf.length === 0) continue;
    const text = buf.toString("utf-8");

    for (const { pattern, label } of INJECTION_PATTERNS) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) {
        const start = Math.max(0, match.index - 20);
        const end = Math.min(text.length, match.index + match[0].length + 20);
        findings.push({
          field,
          snippet: text.slice(start, end),
          pattern: label,
        });
      }
    }
  }

  return findings;
}

export async function sanitizeImage(options: {
  buffer: Buffer;
  maxInputSize?: number;
  scanForInjection?: boolean;
}): Promise<SanitizeResult> {
  const { buffer, maxInputSize = 20_971_520, scanForInjection = true } = options;
  const start = performance.now();

  // Size check
  if (buffer.length > maxInputSize) {
    throw new ImageSanitizeError(
      "SIZE_EXCEEDED",
      `Image size ${buffer.length} exceeds limit ${maxInputSize}`,
    );
  }

  // Format check
  const format = detectFormat(buffer);
  if (!format) {
    throw new ImageSanitizeError(
      "UNSUPPORTED_FORMAT",
      "Could not detect image format from magic bytes",
    );
  }

  // Read metadata for injection scanning before stripping
  let suspiciousFindings: SuspiciousFinding[] = [];
  let orientationApplied = false;

  try {
    const metadata = await sharp(buffer).metadata();
    orientationApplied = metadata.orientation !== undefined && metadata.orientation !== 1;

    if (scanForInjection) {
      suspiciousFindings = scanMetadataForInjection({
        exif: metadata.exif,
        xmp: metadata.xmp,
        iptc: metadata.iptc,
      });
    }
  } catch {
    throw new ImageSanitizeError(
      "CORRUPT_IMAGE",
      "Failed to read image metadata — image may be corrupt",
    );
  }

  // Strip metadata + apply orientation
  let sanitizedBuffer: Buffer;
  try {
    sanitizedBuffer = await sharp(buffer).rotate().toBuffer();
  } catch {
    throw new ImageSanitizeError(
      "PROCESSING_FAILED",
      "sharp processing pipeline failed",
    );
  }

  const durationMs = Math.round(performance.now() - start);

  return {
    buffer: sanitizedBuffer,
    report: {
      originalSize: buffer.length,
      sanitizedSize: sanitizedBuffer.length,
      format,
      orientationApplied,
      metadataStripped: true,
      suspiciousFindings,
      durationMs,
    },
  };
}

export function buildSanitizeAuditEntry(
  report: SanitizationReport,
  userId: string,
): Omit<AuditEntry, "timestamp"> {
  return {
    action: "image_sanitize",
    toolName: "image-sanitizer",
    toolArgs: {
      format: report.format,
      originalSize: report.originalSize,
      sanitizedSize: report.sanitizedSize,
      orientationApplied: report.orientationApplied,
      suspiciousFindings: report.suspiciousFindings.length,
    },
    riskLevel: report.suspiciousFindings.length > 0 ? "L2" : "L0",
    approved: true,
    result: report.suspiciousFindings.length > 0
      ? `Suspicious metadata: ${report.suspiciousFindings.map((f) => f.pattern).join(", ")}`
      : "clean",
    userId,
  };
}
