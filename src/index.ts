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
import { setTtsConfig } from "./voice/synthesizer.js";
import { initWebhookTool } from "./tools/webhook.js";
import { startWebhookServer } from "./webhooks/server.js";
import { killAllProcesses } from "./tools/process.js";
import { destroyAllSessions, getOrCreateContainer } from "./sandbox/session-pool.js";
import { isDockerAvailable } from "./sandbox/container.js";
import { createHub } from "./agents/hub.js";
import { createCompanionWSServer, type CompanionWSServer } from "./companion/ws-server.js";

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
import "./tools/process.js";
import "./tools/tts.js";
import "./tools/agents.js";
import "./tools/companion.js";
import "./tools/smart-home.js";
import "./tools/gmail.js";
import "./tools/calendar.js";

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

  // Initialize TTS config (if API key is set)
  if (config.tts.apiKey) {
    setTtsConfig({
      apiKey: config.tts.apiKey,
      voiceId: config.tts.voiceId,
      model: config.tts.model,
      cacheSize: config.tts.cacheSize,
    });
    console.log("TTS: ElevenLabs configured");
  }

  // Initialize sandbox (check Docker availability)
  if (config.sandbox.enabled) {
    const dockerOk = await isDockerAvailable();
    if (dockerOk) {
      console.log("Sandbox: Docker available");
    } else {
      console.warn(t("sandbox.dockerNotFound"));
    }
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

  // Initialize agent hub early (before platform, so routeMessage can reference it)
  const agentHub = config.agents.enabled
    ? createHub({ routingStrategy: config.agents.routingStrategy })
    : null;

  // Unified routing: hub if active, otherwise direct agent loop
  // Note: `platform` is defined below; this closure captures it by reference
  async function routeMessage(chatId: string, text: string) {
    if (agentHub) {
      await agentHub.route(chatId, text);
    } else {
      await runAgentLoopStreaming(config, chatId, text, platform);
    }
  }

  // Create messaging platform with callbacks
  const callbacks: PlatformCallbacks = {
    async onMessage(chatId, text) {
      await routeMessage(chatId, text);
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

  // Initialize companion WebSocket server (after platform is ready)
  // Skip if platform is already "companion" (adapter creates its own WS server)
  let companionServer: CompanionWSServer | null = null;
  if (config.companion.enabled && config.platform !== "companion") {
    companionServer = createCompanionWSServer({
      port: config.companion.wsPort,
      callbacks: {
        async onMessage(chatId, text) {
          await routeMessage(chatId, text);
        },
        async onImageMessage(chatId, data, mime) {
          await callbacks.onImageMessage(chatId, { buffer: data, mimeType: mime });
        },
        async onVoiceMessage(chatId, data, mime) {
          await callbacks.onVoiceMessage(chatId, { buffer: data, mimeType: mime });
        },
        async onApprovalResponse(nonce, approved) {
          resolveApproval(nonce, approved);
        },
        async onLocation(_chatId, _lat, _lon) {
          // Location handling — future use
        },
      },
    });
    await companionServer.start();
    console.log(`Companion: WebSocket server on port ${config.companion.wsPort}`);
  }

  // Initialize agent hub executor (hub was created early, now wire the executor)
  if (agentHub) {
    await agentHub.init(async (_agentId, chatId, message) => {
      await runAgentLoopStreaming(config, chatId, message, platform);
      return "OK";
    });
    console.log(`Agent hub: ${config.agents.routingStrategy} routing`);
  }

  // Initialize scheduler after platform is ready (executor needs platform reference)
  initScheduler(
    async (chatId, task) => routeMessage(chatId, task),
    config.database.url,
  );

  // Initialize webhook server (if enabled)
  let webhookStop: (() => Promise<void>) | null = null;
  if (config.webhook.enabled) {
    const { router, handler } = initWebhookTool({
      executor: async (chatId, message) => routeMessage(chatId, message),
      port: config.webhook.port,
      host: config.webhook.host,
    });
    const webhookServer = startWebhookServer({
      port: config.webhook.port,
      router,
      handler,
    });
    await webhookServer.start();
    webhookStop = webhookServer.stop;
    console.log(t("webhook.serverStarted", { port: String(config.webhook.port) }));
  }

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    await stopScheduler();
    if (webhookStop) await webhookStop();
    await platform.stop();
    rejectAllPending("SHUTDOWN");
    await waitForInflight(10_000);
    await killAllProcesses();
    await destroyAllSessions();
    await closeAllBrowsers();
    if (companionServer) companionServer.stop();
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
