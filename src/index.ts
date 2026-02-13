import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config/defaults.js";
import { setLocale } from "./i18n/index.js";
import { t } from "./i18n/index.js";
import { createPlatform } from "./messaging/create-platform.js";
import { rejectAllPending, resolveApproval } from "./approval/approval-gate.js";
import { disconnectAll, connectMcpServer, setAllowedServers } from "./tools/mcp-client.js";
import { initLastHash } from "./audit/audit-log.js";
import { getDb, closeDb } from "./db/client.js";
import { setDbUrl } from "./orchestrator/conversation.js";
import { initClaudeCode } from "./tools/claude-code.js";
import { checkClaudeCodeReady } from "./onboarding/check.js";
import { runAgentLoopStreaming } from "./orchestrator/agent-loop.js";
import type { PlatformCallbacks } from "./messaging/platform.js";
import { processImage } from "./messaging/image-handler.js";
import { ImageSanitizeError } from "./security/image-sanitizer.js";
import { setSearchConfig } from "./tools/web-search.js";
import { initScheduler, stopScheduler } from "./automation/scheduler.js";
import { setOllamaConfig } from "./memory/embeddings.js";
import { closeAllBrowsers } from "./browser/launcher.js";
import { setTranscriberConfig } from "./voice/transcriber.js";
import { convertToWav, isConversionNeeded } from "./voice/converter.js";
import { transcribe } from "./voice/transcriber.js";
import { setCompactionConfig } from "./orchestrator/compaction/compactor.js";
import { discoverSkills } from "./skills/registry.js";

// Import tools to register them
import "./tools/filesystem.js";
import "./tools/shell.js";
import "./tools/git.js";
import "./tools/search.js";
import "./tools/claude-code.js";
import "./tools/project-map.js";
import "./tools/web-search.js";
import "./tools/web-fetch.js";
import "./tools/cron.js";
import "./tools/memory.js";
import "./tools/browser.js";
import "./tools/skill.js";

let inFlightCount = 0;

export function trackInflight(delta: number) {
  inFlightCount += delta;
}

async function healthCheckOllama(baseUrl: string): Promise<boolean> {
  const maxRetries = 3;
  const retryDelayMs = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/tags`);
      if (res.ok) {
        const data = await res.json() as { models?: Array<{ name: string }> };
        const models = data.models?.map((m) => m.name).join(", ") ?? "none";
        console.log(`Ollama OK — available models: ${models}`);
        return true;
      }
      console.warn(`Ollama responded ${res.status} — may not be ready yet`);
    } catch {
      if (attempt < maxRetries) {
        console.warn(t("app.ollamaRetrying", { attempt: String(attempt) }));
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }

  console.warn(t("app.ollamaNotReachable", { attempts: String(maxRetries) }));
  return false;
}

async function waitForInflight(timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (inFlightCount > 0 && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (inFlightCount > 0) {
    console.warn(`${inFlightCount} in-flight operations still running at shutdown`);
  }
}

async function main() {
  console.log("geofrey.ai starting...");

  const config = loadConfig();
  setLocale(config.locale);
  console.log(`Orchestrator model: ${config.ollama.model}`);
  console.log(`Platform: ${config.platform}`);

  // Ensure data directories exist
  await mkdir("data/audit", { recursive: true });
  await mkdir("data/images", { recursive: true });

  // Restore audit hash chain from last entry (F13)
  await initLastHash(config.audit.logDir);

  // Initialize database
  getDb(config.database.url);
  setDbUrl(config.database.url);

  // Initialize Claude Code driver
  initClaudeCode(config.claude);

  // Initialize web search config
  setSearchConfig(config.search);

  // Initialize memory embeddings config
  setOllamaConfig(config.ollama);

  // Initialize voice transcriber config
  setTranscriberConfig({
    provider: config.voice.sttProvider,
    openaiApiKey: config.voice.openaiApiKey,
    whisperModelPath: config.voice.whisperModelPath,
  });

  // Initialize compaction config
  setCompactionConfig({
    ollamaBaseUrl: config.ollama.baseUrl,
    ollamaModel: config.ollama.model,
    maxContextTokens: config.ollama.numCtx,
    threshold: 0.75,
  });

  // Ensure memory directory exists
  await mkdir("data/memory", { recursive: true });

  // Discover and load skills
  try {
    const skills = await discoverSkills();
    if (skills.length > 0) {
      console.log(`Skills loaded: ${skills.length}`);
    }
  } catch {
    // Non-critical: skills are optional
  }

  // Claude Code onboarding check
  const claudeStatus = await checkClaudeCodeReady(config.claude);
  console.log(claudeStatus.message);
  if (!claudeStatus.ready && config.claude.enabled) {
    console.warn(t("app.claudeUnavailable"));
  }

  // Health check Ollama (non-blocking)
  await healthCheckOllama(config.ollama.baseUrl);

  // Apply MCP server allowlist (F10)
  setAllowedServers(config.mcp.allowedServers);

  // Connect MCP servers (if configured via env)
  const mcpServersEnv = process.env.MCP_SERVERS;
  if (mcpServersEnv) {
    try {
      const servers = JSON.parse(mcpServersEnv) as Array<{ name: string; command: string; args?: string[] }>;
      for (const server of servers) {
        await connectMcpServer(server);
      }
    } catch (err) {
      console.warn("Failed to parse MCP_SERVERS:", err);
    }
  }

  // Create messaging platform with callbacks
  const callbacks: PlatformCallbacks = {
    async onMessage(chatId, text) {
      await runAgentLoopStreaming(config, chatId, text, platform);
    },
    async onImageMessage(chatId, image) {
      if (!config.imageSanitizer.enabled) {
        await platform.sendMessage(chatId, t("messaging.imageUnsupported"));
        return;
      }
      try {
        await platform.sendMessage(chatId, t("messaging.imageProcessing"));
        const processed = await processImage(image, chatId, config);
        if (!processed.ocrText && image.caption === undefined) {
          // Warn about OCR failure only if there was no caption fallback
        }
        await runAgentLoopStreaming(config, chatId, processed.description, platform);
      } catch (err) {
        if (err instanceof ImageSanitizeError) {
          switch (err.code) {
            case "SIZE_EXCEEDED": {
              const maxMB = `${Math.round(config.imageSanitizer.maxInputSizeBytes / 1_048_576)}MB`;
              await platform.sendMessage(chatId, t("messaging.imageTooLarge", { maxSize: maxMB }));
              break;
            }
            case "UNSUPPORTED_FORMAT":
              await platform.sendMessage(chatId, t("messaging.imageUnsupported"));
              break;
            default:
              await platform.sendMessage(chatId, t("messaging.imageDownloadFailed"));
              break;
          }
        } else {
          console.error("Image processing error:", err);
          await platform.sendMessage(chatId, t("messaging.imageDownloadFailed"));
        }
      }
    },
    async onVoiceMessage(chatId, voice) {
      try {
        await platform.sendMessage(chatId, t("voice.transcribing"));
        let audioBuffer = voice.buffer;
        const format = voice.mimeType.replace(/^audio\//, "");
        if (isConversionNeeded(format)) {
          audioBuffer = await convertToWav(audioBuffer, format);
        }
        const result = await transcribe(audioBuffer, "wav");
        const text = t("voice.transcribed", { text: result.text });
        await runAgentLoopStreaming(config, chatId, text, platform);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Voice transcription error:", msg);
        await platform.sendMessage(chatId, t("voice.transcriptionFailed", { msg }));
      }
    },
    async onApprovalResponse(nonce, approved) {
      resolveApproval(nonce, approved);
    },
  };

  const platform = await createPlatform(config, callbacks);

  // Initialize scheduler after platform is ready (executor needs platform reference)
  initScheduler(
    async (chatId, task) => runAgentLoopStreaming(config, chatId, task, platform),
    config.database.url,
  );

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    await stopScheduler();
    await platform.stop();
    rejectAllPending("SHUTDOWN");
    await waitForInflight(10_000);
    await closeAllBrowsers();
    await disconnectAll();
    closeDb();
    console.log("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await platform.start();
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
