import { spawn } from "node:child_process";
import { t } from "../i18n/index.js";

export interface ElevenLabsTtsConfig {
  provider: "elevenlabs";
  apiKey: string;
  voiceId: string;
  cacheLruSize: number;
}

export interface PiperTtsConfig {
  provider: "piper";
  modelPath: string;
  cacheLruSize: number;
}

export type TtsConfig = ElevenLabsTtsConfig | PiperTtsConfig;

let ttsConfig: TtsConfig | null = null;

export function setTtsConfig(config: TtsConfig): void {
  ttsConfig = config;
}

export function getTtsConfig(): TtsConfig | null {
  return ttsConfig;
}

// LRU cache: Map preserves insertion order, so oldest entries are first
const cache = new Map<string, Buffer>();

function cacheGet(key: string): Buffer | undefined {
  const val = cache.get(key);
  if (val !== undefined) {
    // Move to end (most recently used)
    cache.delete(key);
    cache.set(key, val);
  }
  return val;
}

function cachePut(key: string, value: Buffer): void {
  if (!ttsConfig) return;
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  // Evict oldest entries if over limit
  while (cache.size > ttsConfig.cacheLruSize) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function clearCache(): void {
  cache.clear();
}

export function getCacheSize(): number {
  return cache.size;
}

/**
 * Split text on sentence boundaries, keeping chunks under maxChars.
 */
export function splitText(text: string, maxChars = 4000): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Wrap raw PCM s16le mono data in a WAV header.
 */
function wrapPcmInWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);          // chunk size
  header.writeUInt16LE(1, 20);           // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

const PIPER_TIMEOUT_MS = 30_000;

/**
 * Synthesize text to WAV audio via Piper (local TTS).
 * Piper outputs raw PCM s16le mono 22050Hz on stdout when using --output_raw.
 */
async function synthesizePiper(text: string): Promise<Buffer> {
  if (!ttsConfig || ttsConfig.provider !== "piper") {
    throw new Error("Piper TTS not configured");
  }

  const { modelPath } = ttsConfig;

  return new Promise((resolve, reject) => {
    const proc = spawn("piper", [
      "--model", modelPath,
      "--output_raw",
    ], { timeout: PIPER_TIMEOUT_MS });

    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", () => {}); // piper logs progress to stderr

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}`));
        return;
      }
      // Raw PCM s16le mono 22050Hz — wrap in WAV header
      const pcm = Buffer.concat(chunks);
      const wav = wrapPcmInWav(pcm, 22050, 1, 16);
      resolve(wav);
    });

    proc.on("error", (err) => reject(new Error(`Piper not found: ${err.message}`)));

    proc.stdin.write(text);
    proc.stdin.end();
  });
}

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Synthesize a single text chunk via ElevenLabs API v1.
 */
async function synthesizeElevenLabs(text: string, voiceIdOverride?: string): Promise<Buffer> {
  if (!ttsConfig || ttsConfig.provider !== "elevenlabs") {
    throw new Error("ElevenLabs TTS not configured");
  }

  const voiceId = voiceIdOverride ?? ttsConfig.voiceId;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ttsConfig.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs API returned ${res.status}: ${await res.text()}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Synthesize a single text chunk to audio.
 * Dispatches to the configured provider (piper or elevenlabs).
 */
export async function synthesize(text: string, voiceIdOverride?: string): Promise<Buffer> {
  if (!ttsConfig) {
    throw new Error("TTS not configured — call setTtsConfig() first");
  }

  if (ttsConfig.provider === "piper") {
    const cacheKey = `piper:${text}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
    const buf = await synthesizePiper(text);
    cachePut(cacheKey, buf);
    return buf;
  }

  // ElevenLabs path
  const voiceId = voiceIdOverride ?? ttsConfig.voiceId;
  const cacheKey = `${voiceId}:${text}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const buf = await synthesizeElevenLabs(text, voiceIdOverride);
  cachePut(cacheKey, buf);
  return buf;
}

/**
 * Synthesize long text by splitting and concatenating audio chunks.
 */
export async function synthesizeLong(text: string, voiceIdOverride?: string): Promise<Buffer> {
  const chunks = splitText(text);
  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    const audio = await synthesize(chunk, voiceIdOverride);
    buffers.push(audio);
  }

  return Buffer.concat(buffers);
}

export interface VoiceInfo {
  id: string;
  name: string;
  category: string;
}

/**
 * List available voices from ElevenLabs.
 */
export async function listVoices(): Promise<VoiceInfo[]> {
  if (!ttsConfig) {
    throw new Error("TTS not configured — call setTtsConfig() first");
  }

  if (ttsConfig.provider === "piper") {
    // Piper uses local model files — no remote voice listing available
    return [];
  }

  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": ttsConfig.apiKey },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs API returned ${res.status}`);
  }

  const data = await res.json() as { voices?: Array<{ voice_id?: string; name?: string; category?: string }> };
  return (data.voices ?? [])
    .filter((v) => v.voice_id && v.name)
    .map((v) => ({
      id: v.voice_id!,
      name: v.name!,
      category: v.category ?? "unknown",
    }));
}
