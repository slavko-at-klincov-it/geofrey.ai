import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execa } from "execa";

const WAV_FORMATS = new Set(["wav", "wave"]);
const NEEDS_CONVERSION = new Set(["ogg", "opus", "mp4", "m4a", "oga", "webm", "mp3", "aac", "flac"]);

/**
 * Check whether the given audio format needs conversion to WAV.
 */
export function isConversionNeeded(format: string): boolean {
  const normalized = format.toLowerCase().replace(/^audio\//, "");
  if (WAV_FORMATS.has(normalized)) return false;
  return NEEDS_CONVERSION.has(normalized) || !WAV_FORMATS.has(normalized);
}

/**
 * Check whether ffmpeg is installed and available on PATH.
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execa("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert an audio buffer to WAV 16 kHz mono PCM using ffmpeg.
 * Returns the original buffer if no conversion is needed.
 */
export async function convertToWav(inputBuffer: Buffer, inputFormat: string): Promise<Buffer> {
  const normalized = inputFormat.toLowerCase().replace(/^audio\//, "");

  if (!isConversionNeeded(normalized)) {
    return inputBuffer;
  }

  const id = randomUUID();
  const tmpDir = tmpdir();
  const ext = normalized === "opus" ? "ogg" : normalized;
  const inputPath = join(tmpDir, `geofrey-voice-in-${id}.${ext}`);
  const outputPath = join(tmpDir, `geofrey-voice-out-${id}.wav`);

  try {
    await writeFile(inputPath, inputBuffer);

    await execa("ffmpeg", [
      "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-f", "wav",
      "-y",
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    // Clean up temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
