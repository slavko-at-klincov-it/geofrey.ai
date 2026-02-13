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
import { initClaudeCode, setAnonymizerConfig } from "./tools/claude-code.js";
import { checkClaudeCodeReady } from "./onboarding/check.js";
import { runAgentLoopStreaming } from "./orchestrator/agent-loop.js";
import type { PlatformCallbacks } from "./messaging/platform.js";
import { processImage } from "./messaging/image-handler.js";
import { ImageSanitizeError } from "./security/image-sanitizer.js";
import { setSearchConfig } from "./tools/web-search.js";
import { initScheduler, stopScheduler } from "./automation/scheduler.js";
import { setOllamaConfig, indexMemory, getOllamaConfig } from "./memory/embeddings.js";
import { closeAllBrowsers } from "./browser/launcher.js";
import { setTranscriberConfig } from "./voice/transcriber.js";
import { convertToWav, isConversionNeeded } from "./voice/converter.js";
import { transcribe } from "./voice/transcriber.js";
import { setCompactionConfig } from "./orchestrator/compaction/compactor.js";
import { discoverSkills } from "./skills/registry.js";
import { initWebhookTool } from "./tools/webhook.js";
import { startWebhookServer } from "./webhooks/server.js";
import { killAllProcesses } from "./tools/process.js";
import { destroyAllSessions } from "./sandbox/session-pool.js";
import { isDockerAvailable } from "./sandbox/container.js";
import { createHub } from "./agents/hub.js";
import { loadProfile } from "./profile/store.js";
import { getProfilePiiTerms } from "./privacy/profile-pii.js";
import { isProactiveTask, buildProactivePrompt } from "./proactive/handler.js";
import { setupProactiveJobs } from "./proactive/setup.js";

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
import "./tools/agents.js";
import "./tools/tts.js";
import "./tools/companion.js";
import "./tools/smart-home.js";
import "./tools/gmail.js";
import "./tools/calendar.js";
import "./tools/privacy.js";

function resolveOwnerChatId(config: ReturnType<typeof loadConfig>): string | null {
  switch (config.platform) {
    case "telegram": return String(config.telegram.ownerId);
    case "whatsapp": return config.whatsapp?.ownerPhone ?? null;
    case "signal": return config.signal?.ownerPhone ?? null;
    case "slack": return config.slack?.channelId ?? null;
    case "discord": return config.discord?.channelId ?? null;
    case "webchat": return "webchat-owner";
    default: return null;
  }
}

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

  // Initialize anonymizer
  setAnonymizerConfig({
    ...config.anonymizer,
    dbUrl: config.database.url,
    ollama: config.anonymizer.llmPass ? {
      ollamaBaseUrl: config.ollama.baseUrl,
      ollamaModel: config.ollama.model,
    } : undefined,
  });

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

  // Index memory for semantic search at startup
  try {
    const chunks = await indexMemory(getOllamaConfig(), config.database.url);
    if (chunks > 0) console.log(`Memory indexed: ${chunks} chunks`);
  } catch {
    // Non-critical: memory indexing can fail if Ollama is not ready
  }

  // Discover and load skills
  try {
    const skills = await discoverSkills();
    if (skills.length > 0) {
      console.log(`Skills loaded: ${skills.length}`);
    }
  } catch {
    // Non-critical: skills are optional
  }

  // Initialize sandbox (check Docker availability)
  if (config.sandbox.enabled) {
    const { setSandboxConfig } = await import("./tools/shell.js");
    setSandboxConfig(config.sandbox);
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

  // Initialize Vision model config for image classification
  if (process.env.VISION_MODEL) {
    const { setVisionConfig } = await import("./privacy/image-classifier.js");
    setVisionConfig({
      ollamaBaseUrl: config.ollama.baseUrl,
      model: process.env.VISION_MODEL,
    });
    console.log(`Vision: ${process.env.VISION_MODEL} configured`);
  }

  // Initialize privacy tool DB URL
  if (config.database.url) {
    const { setPrivacyDbUrl } = await import("./tools/privacy.js");
    setPrivacyDbUrl(config.database.url);
  }

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

  // Initialize TTS
  if (config.tts.enabled && config.tts.apiKey) {
    const { setTtsConfig } = await import("./voice/synthesizer.js");
    setTtsConfig({
      provider: "elevenlabs",
      apiKey: config.tts.apiKey,
      voiceId: config.tts.voiceId,
      cacheLruSize: config.tts.cacheLruSize,
    });
    console.log("TTS: ElevenLabs initialized");
  }

  // Initialize Companion WebSocket server
  let companionStop: (() => Promise<void>) | null = null;
  if (config.companion.enabled) {
    const { startCompanionServer } = await import("./companion/ws-server.js");
    const server = await startCompanionServer({
      wsPort: config.companion.wsPort,
      pairingTtlMs: config.companion.pairingTtlMs,
    });
    companionStop = async () => { await server.stop(); };
    console.log(`Companion: WebSocket server on :${config.companion.wsPort}`);
  }

  // Initialize Smart Home integrations
  if (config.smartHome.enabled) {
    if (config.smartHome.hueApiKey && config.smartHome.hueBridgeIp) {
      const { setHueConfig } = await import("./integrations/hue.js");
      setHueConfig({ bridgeIp: config.smartHome.hueBridgeIp, apiKey: config.smartHome.hueApiKey });
    }
    if (config.smartHome.haToken && config.smartHome.haUrl) {
      const { setHaConfig } = await import("./integrations/homeassistant.js");
      setHaConfig({ url: config.smartHome.haUrl, token: config.smartHome.haToken });
    }
    if (config.smartHome.sonosHttpApiUrl) {
      const { setSonosConfig } = await import("./integrations/sonos.js");
      setSonosConfig({ httpApiUrl: config.smartHome.sonosHttpApiUrl });
    }
    console.log("Smart Home: Integration enabled");
  }

  // Load user profile
  const profile = await loadProfile();
  if (profile) {
    console.log(`Profile: ${profile.name} (${profile.timezone})`);
    // Merge profile PII terms into anonymizer config
    const profileTerms = getProfilePiiTerms();
    if (profileTerms.length > 0) {
      setAnonymizerConfig({
        ...config.anonymizer,
        customTerms: [...config.anonymizer.customTerms, ...profileTerms],
        dbUrl: config.database.url,
        ollama: config.anonymizer.llmPass ? {
          ollamaBaseUrl: config.ollama.baseUrl,
          ollamaModel: config.ollama.model,
        } : undefined,
      });
      console.log(`Anonymizer: ${profileTerms.length} PII terms from profile`);
    }
  }

  // Initialize Google OAuth
  if (config.google.enabled && config.google.clientId) {
    const { setGoogleConfig } = await import("./integrations/google/auth.js");
    setGoogleConfig({
      clientId: config.google.clientId,
      clientSecret: config.google.clientSecret!,
      redirectUrl: config.google.redirectUrl,
      tokenCachePath: config.google.tokenCachePath,
    });
    console.log("Google: OAuth2 configured");
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
        await routeMessage(chatId, processed.description);
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
        await routeMessage(chatId, text);
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

  // Initialize agent hub executor (hub was created early, now wire the executor)
  if (agentHub) {
    await agentHub.init(async (agentId, chatId, message) => {
      await runAgentLoopStreaming(config, chatId, message, platform, agentId);
      return "OK";
    });
    console.log(`Agent hub: ${config.agents.routingStrategy} routing`);
  }

  // Initialize scheduler after platform is ready (executor needs platform reference)
  initScheduler(
    async (chatId, task) => {
      if (isProactiveTask(task)) {
        const prompt = await buildProactivePrompt(task);
        if (prompt) await routeMessage(chatId, prompt);
        return;
      }
      await routeMessage(chatId, task);
    },
    config.database.url,
  );

  // Set up proactive jobs if profile exists
  if (profile) {
    const ownerChatId = resolveOwnerChatId(config);
    if (ownerChatId) {
      await setupProactiveJobs(ownerChatId);
    }
  }

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
    if (companionStop) await companionStop();
    await platform.stop();
    rejectAllPending("SHUTDOWN");
    await waitForInflight(10_000);
    await killAllProcesses();
    await destroyAllSessions();
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
