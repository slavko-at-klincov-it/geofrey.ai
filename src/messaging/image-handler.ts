import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { sanitizeImage, buildSanitizeAuditEntry, type SanitizationReport } from "../security/image-sanitizer.js";
import { appendAuditEntry } from "../audit/audit-log.js";
import type { Config } from "../config/schema.js";
import type { ImageAttachment } from "./platform.js";

export interface ProcessedImage {
  description: string;
  storagePath: string;
  report: SanitizationReport;
  ocrText: string;
}

const STORAGE_DIR = "data/images";
const OCR_MAX_CHARS = 2000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1_048_576).toFixed(1)}MB`;
}

export async function processImage(
  image: ImageAttachment,
  chatId: string,
  config: Config,
): Promise<ProcessedImage> {
  // Sanitize image (strip metadata, detect format, scan for injection)
  const { buffer: sanitizedBuffer, report } = await sanitizeImage({
    buffer: image.buffer,
    maxInputSize: config.imageSanitizer.maxInputSizeBytes,
    scanForInjection: config.imageSanitizer.scanForInjection,
  });

  // Get dimensions from sanitized buffer
  const metadata = await sharp(sanitizedBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // Audit entry
  await appendAuditEntry(config.audit.logDir, {
    ...buildSanitizeAuditEntry(report, chatId),
    timestamp: new Date().toISOString(),
  });

  // Store sanitized file
  await mkdir(STORAGE_DIR, { recursive: true });
  const uuid = randomUUID();
  const ext = report.format;
  const storagePath = join(STORAGE_DIR, `${uuid}.${ext}`);
  await writeFile(storagePath, sanitizedBuffer);

  // OCR via tesseract.js (lazy import, non-fatal)
  let ocrText = "";
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const { data: { text } } = await worker.recognize(sanitizedBuffer);
      ocrText = text.trim().slice(0, OCR_MAX_CHARS);
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.warn("OCR failed (non-fatal):", err);
  }

  // Build text description for orchestrator
  const parts: string[] = [
    `[Image: ${report.format}, ${width}x${height}, ${formatBytes(report.sanitizedSize)}]`,
  ];

  if (report.suspiciousFindings.length > 0) {
    parts.push(`WARNING: ${report.suspiciousFindings.length} suspicious metadata finding(s) stripped`);
  }

  if (ocrText) {
    parts.push(`OCR: "${ocrText}"`);
  }

  if (image.caption) {
    parts.push(`Caption: ${image.caption}`);
  }

  parts.push(`Stored: ${storagePath}`);

  return {
    description: parts.join("\n"),
    storagePath,
    report,
    ocrText,
  };
}
