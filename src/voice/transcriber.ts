import { writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execa } from "execa";

export type SttProvider = "openai" | "local";

export interface TranscriptionResult {
  text: string;
  language?: string;
  durationMs?: number;
}

interface TranscriberConfig {
  provider: SttProvider;
  openaiApiKey?: string;
  whisperModelPath?: string;
}

let config: TranscriberConfig | null = null;

/**
 * Set the transcriber configuration. Must be called before transcribe().
 */
export function setTranscriberConfig(c: TranscriberConfig): void {
  config = c;
}

/**
 * Transcribe an audio buffer to text, routing to the configured provider.
 */
export async function transcribe(audioBuffer: Buffer, format: string): Promise<TranscriptionResult> {
  if (!config) {
    throw new Error("Transcriber not configured — call setTranscriberConfig() first");
  }

  if (config.provider === "openai") {
    return transcribeOpenai(audioBuffer, format);
  }

  return transcribeLocal(audioBuffer, format);
}

/**
 * Transcribe using OpenAI Whisper API.
 */
export async function transcribeOpenai(audioBuffer: Buffer, format: string): Promise<TranscriptionResult> {
  if (!config?.openaiApiKey) {
    throw new Error("OpenAI API key not configured for STT");
  }

  const start = Date.now();
  const ext = format.toLowerCase().replace(/^audio\//, "");
  const fileName = `audio.${ext === "oga" ? "ogg" : ext}`;

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(audioBuffer)]), fileName);
  formData.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.openaiApiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI Whisper API ${res.status}: ${text}`);
  }

  const data = await res.json() as { text: string; language?: string };
  const durationMs = Date.now() - start;

  return {
    text: data.text,
    language: data.language,
    durationMs,
  };
}

/**
 * Transcribe using local whisper.cpp (whisper-cli).
 */
export async function transcribeLocal(audioBuffer: Buffer, format: string): Promise<TranscriptionResult> {
  if (!config?.whisperModelPath) {
    throw new Error("Whisper model path not configured for local STT");
  }

  const start = Date.now();
  const id = randomUUID();
  const tmpDir = tmpdir();
  const ext = format.toLowerCase().replace(/^audio\//, "");
  const inputPath = join(tmpDir, `geofrey-whisper-${id}.${ext}`);
  const outputBase = join(tmpDir, `geofrey-whisper-${id}`);
  const outputPath = `${outputBase}.txt`;

  try {
    await writeFile(inputPath, audioBuffer);

    await execa("whisper-cli", [
      "-m", config.whisperModelPath,
      "-f", inputPath,
      "--output-txt",
      "--no-timestamps",
      "-of", outputBase,
    ]);

    const text = (await readFile(outputPath, "utf-8")).trim();
    const durationMs = Date.now() - start;

    return {
      text,
      durationMs,
    };
  } finally {
    // Clean up temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
