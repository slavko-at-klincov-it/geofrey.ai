import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import { synthesizeLong, listVoices, getTtsConfig } from "../voice/synthesizer.js";
import { t } from "../i18n/index.js";

registerTool({
  name: "tts_speak",
  description: "Text-to-speech via ElevenLabs: synthesize text to audio or list available voices.",
  parameters: z.object({
    action: z.enum(["speak", "list_voices"]),
    text: z.string().optional().describe("Text to synthesize (required for speak)"),
    voiceId: z.string().optional().describe("Override voice ID"),
  }),
  source: "native",
  execute: async ({ action, text, voiceId }) => {
    if (!getTtsConfig()) {
      return t("tts.notConfigured");
    }

    switch (action) {
      case "speak": {
        if (!text) return t("tools.paramRequired", { param: "text", action: "speak" });
        try {
          const audio = await synthesizeLong(text, voiceId);
          return t("tts.spoken", { length: String(audio.length) });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return t("tts.synthesizeFailed", { msg });
        }
      }

      case "list_voices": {
        try {
          const voices = await listVoices();
          if (voices.length === 0) return t("tts.voicesList", { count: "0" });
          const header = t("tts.voicesList", { count: String(voices.length) });
          const list = voices.map((v) => `- ${v.name} (${v.id}) [${v.category}]`).join("\n");
          return `${header}\n${list}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return t("tts.synthesizeFailed", { msg });
        }
      }

      default:
        return t("tools.unknownAction", { action: String(action) });
    }
  },
});
