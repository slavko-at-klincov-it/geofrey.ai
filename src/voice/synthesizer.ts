import { createHash } from "node:crypto";

export interface TtsConfig {
  apiKey: string;
  voiceId: string;
  model: string;
  cacheSize: number;
}

export interface SynthesisResult {
  audio: Buffer;
  contentType: string;
  characterCount: number;
}

const MAX_TEXT_LENGTH = 5000;

let ttsConfig: TtsConfig | null = null;

// LRU cache: Map preserves insertion order; oldest entry = first key
const cache = new Map<string, Buffer>();

/**
 * Set the TTS configuration. Must be called before synthesize().
 */
export function setTtsConfig(config: TtsConfig): void {
  ttsConfig = config;
}

/**
 * Get the current TTS configuration (null if not set).
 */
export function getTtsConfig(): TtsConfig | null {
  return ttsConfig;
}

/**
 * Convert text to speech using ElevenLabs API.
 * Returns audio buffer (audio/mpeg) with metadata.
 */
export async function synthesize(text: string): Promise<SynthesisResult> {
  if (!ttsConfig) {
    throw new Error("TTS not configured — call setTtsConfig() first");
  }

  if (text.length === 0) {
    throw new Error("Text must not be empty");
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters (got ${text.length})`);
  }

  // Check LRU cache
  const hash = createHash("sha256").update(text).digest("hex");
  const cached = cache.get(hash);
  if (cached) {
    // Move to end (most recently used) by deleting and re-inserting
    cache.delete(hash);
    cache.set(hash, cached);
    return {
      audio: cached,
      contentType: "audio/mpeg",
      characterCount: text.length,
    };
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ttsConfig.voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ttsConfig.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: ttsConfig.model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs API ${res.status}: ${body}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const audio = Buffer.from(arrayBuffer);

  // Store in LRU cache — evict oldest if at capacity
  if (cache.size >= ttsConfig.cacheSize) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(hash, audio);

  return {
    audio,
    contentType: "audio/mpeg",
    characterCount: text.length,
  };
}

/**
 * Split text at sentence boundaries so each chunk is within maxLength.
 * Splits at `. `, `! `, `? ` boundaries. Falls back to last space if
 * no sentence boundary is found within the limit.
 */
export function splitText(text: string, maxLength: number = MAX_TEXT_LENGTH): string[] {
  if (text.length === 0) return [];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Look for last sentence boundary within maxLength
    const window = remaining.slice(0, maxLength);
    let splitIdx = -1;

    // Search backwards for sentence-ending punctuation followed by space/newline
    for (let i = window.length - 1; i >= 0; i--) {
      if (
        (window[i] === "." || window[i] === "!" || window[i] === "?") &&
        i + 1 < window.length &&
        (window[i + 1] === " " || window[i + 1] === "\n")
      ) {
        splitIdx = i + 1; // include the punctuation
        break;
      }
    }

    // Fallback: split at last space
    if (splitIdx === -1) {
      splitIdx = window.lastIndexOf(" ");
    }

    // Worst case: hard split at maxLength
    if (splitIdx <= 0) {
      splitIdx = maxLength;
    }

    chunks.push(remaining.slice(0, splitIdx).trimEnd());
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

/**
 * Clear the TTS audio cache.
 */
export function clearTtsCache(): void {
  cache.clear();
}

/**
 * Get current cache size (for testing).
 */
export function getCacheSize(): number {
  return cache.size;
}
