import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import {
  synthesize,
  splitText,
  getTtsConfig,
  type SynthesisResult,
} from "../voice/synthesizer.js";
import { t } from "../i18n/index.js";

let lastSynthesized: SynthesisResult | null = null;

/**
 * Get the last synthesized audio result (for platform delivery layer).
 * Returns null if no audio has been synthesized yet or after retrieval.
 */
export function getLastSynthesizedAudio(): SynthesisResult | null {
  const result = lastSynthesized;
  lastSynthesized = null;
  return result;
}

registerTool({
  name: "tts_speak",
  description: "Convert text to speech using ElevenLabs and send as audio message. Supports up to 5000 characters per request.",
  parameters: z.object({
    text: z.string().describe("The text to convert to speech"),
    chatId: z.string().optional().describe("Chat ID to send audio to"),
  }),
  source: "native",
  execute: async ({ text }) => {
    if (!getTtsConfig()) {
      return t("tts.notConfigured");
    }

    try {
      const MAX_CHUNK = 5000;

      if (text.length > MAX_CHUNK) {
        // Synthesize chunks and keep only the last one for platform delivery
        // (integration layer handles multi-chunk sending)
        const chunks = splitText(text, MAX_CHUNK);
        let totalBytes = 0;
        let totalChars = 0;

        for (const chunk of chunks) {
          const result = await synthesize(chunk);
          totalBytes += result.audio.length;
          totalChars += result.characterCount;
          lastSynthesized = result;
        }

        return t("tts.synthesized", {
          chars: String(totalChars),
          bytes: String(totalBytes),
          chunks: String(chunks.length),
        });
      }

      const result = await synthesize(text);
      lastSynthesized = result;

      return t("tts.synthesized", {
        chars: String(result.characterCount),
        bytes: String(result.audio.length),
        chunks: "1",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return t("tts.failed", { error: msg });
    }
  },
});
