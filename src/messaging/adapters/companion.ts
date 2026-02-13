import { randomBytes } from "node:crypto";
import type { Classification } from "../../approval/risk-classifier.js";
import type { MessagingPlatform, PlatformCallbacks, ChatId, MessageRef } from "../platform.js";
import {
  createCompanionWSServer,
  type CompanionWSServer,
  type CompanionCallbacks,
  type WSServerOptions,
} from "../../companion/ws-server.js";
import {
  getDeviceByChatId,
  listDevices,
} from "../../companion/device-registry.js";
import { type PushDispatcher } from "../../companion/push.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CompanionConfig {
  port?: number;
  pushDispatcher?: PushDispatcher;
}

// ── Adapter ────────────────────────────────────────────────────────────────

export function createCompanionPlatform(
  config: CompanionConfig,
  callbacks: PlatformCallbacks,
): MessagingPlatform {
  let msgCounter = 0;
  let wsServer: CompanionWSServer | null = null;

  const companionCallbacks: CompanionCallbacks = {
    async onMessage(chatId, text) {
      await callbacks.onMessage(chatId, text);
    },

    async onImageMessage(chatId, data, mime) {
      await callbacks.onImageMessage(chatId, {
        buffer: data,
        mimeType: mime,
      });
    },

    async onVoiceMessage(chatId, data, mime) {
      await callbacks.onVoiceMessage(chatId, {
        buffer: data,
        mimeType: mime,
      });
    },

    async onApprovalResponse(nonce, approved) {
      await callbacks.onApprovalResponse(nonce, approved);
    },

    async onLocation(_chatId, _lat, _lon) {
      // Location events handled by orchestrator via tool context
      // Could be forwarded as a special message format
    },
  };

  const serverOptions: WSServerOptions = {
    port: config.port,
    callbacks: companionCallbacks,
    pushDispatcher: config.pushDispatcher,
  };

  wsServer = createCompanionWSServer(serverOptions);

  function generateRef(): string {
    return `cmp-${++msgCounter}-${randomBytes(3).toString("hex")}`;
  }

  function findDeviceIdForChat(chatId: ChatId): string | undefined {
    const device = getDeviceByChatId(chatId);
    return device?.deviceId;
  }

  // Note: using "companion" as name — the platform.ts union type will be
  // updated in the integration step to include "companion"
  const platform: MessagingPlatform = {
    name: "companion" as MessagingPlatform["name"],
    maxMessageLength: 100_000,
    supportsEdit: true,

    async sendMessage(chatId: ChatId, text: string): Promise<MessageRef> {
      const ref = generateRef();
      const deviceId = findDeviceIdForChat(chatId);

      if (deviceId && wsServer) {
        const sent = wsServer.sendToDevice(deviceId, {
          type: "message",
          text,
          messageId: ref,
        });

        // If device is offline, send push notification
        if (!sent) {
          await wsServer.notifyOfflineDevices("Geofrey", truncateForPush(text));
        }
      }

      return ref;
    },

    async editMessage(chatId: ChatId, ref: MessageRef, text: string): Promise<MessageRef> {
      const deviceId = findDeviceIdForChat(chatId);

      if (deviceId && wsServer) {
        wsServer.sendToDevice(deviceId, {
          type: "message",
          text,
          messageId: ref,
        });
      }

      return ref;
    },

    async sendApproval(
      chatId: ChatId,
      nonce: string,
      toolName: string,
      args: Record<string, unknown>,
      _classification: Classification,
    ): Promise<void> {
      const deviceId = findDeviceIdForChat(chatId);

      if (deviceId && wsServer) {
        const sent = wsServer.sendToDevice(deviceId, {
          type: "approval_request",
          nonce,
          toolName,
          args,
        });

        // Push notification for offline devices
        if (!sent) {
          await wsServer.notifyOfflineDevices(
            "Approval Required",
            `Action: ${toolName} — tap to review`,
          );
        }
      }
    },

    async sendAudio(chatId: ChatId, audio: Buffer, _filename: string): Promise<MessageRef> {
      const ref = generateRef();
      const deviceId = findDeviceIdForChat(chatId);

      if (deviceId && wsServer) {
        wsServer.sendToDevice(deviceId, {
          type: "audio",
          data: audio.toString("base64"),
          mime: "audio/mp3",
        });
      }

      return ref;
    },

    async start(): Promise<void> {
      if (wsServer) {
        await wsServer.start();
      }
    },

    async stop(): Promise<void> {
      if (wsServer) {
        await wsServer.stop();
        wsServer = null;
      }
    },
  };

  return platform;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function truncateForPush(text: string, maxLength = 200): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Get the companion WebSocket server from a platform instance.
 * Returns undefined if the platform is not a companion adapter.
 */
export function getCompanionWSServer(platform: MessagingPlatform): CompanionWSServer | undefined {
  // The server is encapsulated — to send to a specific device,
  // use the platform.sendMessage with the device's chatId
  return undefined;
}
