import { t } from "../i18n/index.js";

export interface TtsConfig {
  provider: "elevenlabs";
  apiKey: string;
  voiceId: string;
  cacheLruSize: number;
}

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

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Synthesize a single text chunk to audio via ElevenLabs API v1.
 */
export async function synthesize(text: string, voiceIdOverride?: string): Promise<Buffer> {
  if (!ttsConfig) {
    throw new Error("TTS not configured — call setTtsConfig() first");
  }

  const voiceId = voiceIdOverride ?? ttsConfig.voiceId;
  const cacheKey = `${voiceId}:${text}`;

  const cached = cacheGet(cacheKey);
  if (cached) return cached;

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

  const buffer = Buffer.from(await res.arrayBuffer());
  cachePut(cacheKey, buffer);
  return buffer;
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
