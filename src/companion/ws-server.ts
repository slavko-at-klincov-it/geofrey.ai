import { createServer, type Server } from "node:http";
import { z } from "zod";
import { redeemPairingCode } from "./pairing.js";
import {
  getDevice,
  updateLastSeen,
  setDeviceOnline,
  getOfflineDevicesWithPush,
  type Device,
  type DevicePlatform,
} from "./device-registry.js";
import { type PushDispatcher } from "./push.js";

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_WS_PORT = 3003;
const HEARTBEAT_TIMEOUT_MS = 90_000; // Mark offline if no status in 90s
const HEARTBEAT_CHECK_INTERVAL_MS = 30_000;

// ── Event Schemas ──────────────────────────────────────────────────────────

const wsAuthEventSchema = z.object({
  type: z.literal("auth"),
  token: z.string().min(1),
});

const wsPairEventSchema = z.object({
  type: z.literal("pair"),
  code: z.string().length(6),
  deviceName: z.string().min(1),
  devicePlatform: z.enum(["ios", "macos", "android"]),
  pushToken: z.string().optional(),
});

const wsMessageEventSchema = z.object({
  type: z.literal("message"),
  text: z.string().min(1),
});

const wsImageEventSchema = z.object({
  type: z.literal("image"),
  data: z.string().min(1), // base64
  mime: z.string().min(1),
});

const wsVoiceEventSchema = z.object({
  type: z.literal("voice"),
  data: z.string().min(1), // base64
  mime: z.string().min(1),
});

const wsApprovalResponseSchema = z.object({
  type: z.literal("approval_response"),
  nonce: z.string().min(1),
  approved: z.boolean(),
});

const wsLocationEventSchema = z.object({
  type: z.literal("location"),
  lat: z.number(),
  lon: z.number(),
});

const wsStatusEventSchema = z.object({
  type: z.literal("status"),
  online: z.boolean(),
});

const wsEventSchema = z.discriminatedUnion("type", [
  wsAuthEventSchema,
  wsPairEventSchema,
  wsMessageEventSchema,
  wsImageEventSchema,
  wsVoiceEventSchema,
  wsApprovalResponseSchema,
  wsLocationEventSchema,
  wsStatusEventSchema,
]);

export type WSClientEvent = z.infer<typeof wsEventSchema>;

// ── Server Events (sent to client) ────────────────────────────────────────

export interface WSServerMessageEvent {
  type: "message";
  text: string;
  messageId: string;
}

export interface WSServerApprovalEvent {
  type: "approval_request";
  nonce: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface WSServerAudioEvent {
  type: "audio";
  data: string; // base64
  mime: string;
}

export interface WSServerErrorEvent {
  type: "error";
  message: string;
}

export interface WSServerPairedEvent {
  type: "paired";
  deviceId: string;
}

export type WSServerEvent =
  | WSServerMessageEvent
  | WSServerApprovalEvent
  | WSServerAudioEvent
  | WSServerErrorEvent
  | WSServerPairedEvent;

// ── Connection tracking ────────────────────────────────────────────────────

interface ClientConnection {
  deviceId: string;
  ws: WebSocketLike;
  lastHeartbeat: number;
}

/** Minimal WebSocket interface for testability (compatible with `ws` package) */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  readyState: number;
}

export interface CompanionCallbacks {
  onMessage(chatId: string, text: string): Promise<void>;
  onImageMessage(chatId: string, data: Buffer, mime: string): Promise<void>;
  onVoiceMessage(chatId: string, data: Buffer, mime: string): Promise<void>;
  onApprovalResponse(nonce: string, approved: boolean): Promise<void>;
  onLocation(chatId: string, lat: number, lon: number): Promise<void>;
}

export interface WSServerOptions {
  port?: number;
  callbacks: CompanionCallbacks;
  pushDispatcher?: PushDispatcher;
}

// ── WebSocket Server ───────────────────────────────────────────────────────

export function createCompanionWSServer(options: WSServerOptions) {
  const port = options.port ?? DEFAULT_WS_PORT;
  const { callbacks, pushDispatcher } = options;

  let httpServer: Server | null = null;
  let wss: { clients: Set<WebSocketLike>; close: () => void; handleUpgrade: (req: unknown, socket: unknown, head: unknown, cb: (ws: WebSocketLike) => void) => void } | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Connected clients by deviceId
  const connections = new Map<string, ClientConnection>();

  // Unauthenticated connections waiting for auth/pair event
  const pendingConnections = new Set<WebSocketLike>();

  function sendEvent(ws: WebSocketLike, event: WSServerEvent): boolean {
    try {
      if (ws.readyState === 1) { // OPEN
        ws.send(JSON.stringify(event));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  function sendToDevice(deviceId: string, event: WSServerEvent): boolean {
    const conn = connections.get(deviceId);
    if (!conn) return false;
    return sendEvent(conn.ws, event);
  }

  function broadcastToAll(event: WSServerEvent): void {
    for (const [, conn] of connections) {
      sendEvent(conn.ws, event);
    }
  }

  function removeConnection(deviceId: string): void {
    const conn = connections.get(deviceId);
    if (conn) {
      connections.delete(deviceId);
      setDeviceOnline(deviceId, false);
    }
  }

  function handleClientMessage(ws: WebSocketLike, deviceId: string, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sendEvent(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    const result = wsEventSchema.safeParse(parsed);
    if (!result.success) {
      sendEvent(ws, { type: "error", message: `Invalid event: ${result.error.message}` });
      return;
    }

    const event = result.data;
    const device = getDevice(deviceId);
    if (!device) {
      sendEvent(ws, { type: "error", message: "Device not found" });
      ws.close(4001, "Device not found");
      removeConnection(deviceId);
      return;
    }

    switch (event.type) {
      case "message":
        callbacks.onMessage(device.chatId, event.text).catch((err) => {
          console.error("Companion message handler error:", err);
        });
        break;

      case "image": {
        const imgBuffer = Buffer.from(event.data, "base64");
        callbacks.onImageMessage(device.chatId, imgBuffer, event.mime).catch((err) => {
          console.error("Companion image handler error:", err);
        });
        break;
      }

      case "voice": {
        const voiceBuffer = Buffer.from(event.data, "base64");
        callbacks.onVoiceMessage(device.chatId, voiceBuffer, event.mime).catch((err) => {
          console.error("Companion voice handler error:", err);
        });
        break;
      }

      case "approval_response":
        callbacks.onApprovalResponse(event.nonce, event.approved).catch((err) => {
          console.error("Companion approval handler error:", err);
        });
        break;

      case "location":
        callbacks.onLocation(device.chatId, event.lat, event.lon).catch((err) => {
          console.error("Companion location handler error:", err);
        });
        break;

      case "status": {
        const conn = connections.get(deviceId);
        if (conn) {
          conn.lastHeartbeat = Date.now();
        }
        updateLastSeen(deviceId, event.online);
        break;
      }

      case "auth": {
        // Already authenticated — ignore
        break;
      }

      case "pair": {
        // Already paired — ignore
        break;
      }
    }
  }

  function handleNewConnection(ws: WebSocketLike): void {
    pendingConnections.add(ws);

    // First message must be auth or pair
    let authenticated = false;

    ws.on("message", (rawData: unknown) => {
      const raw = typeof rawData === "string" ? rawData : String(rawData);

      if (!authenticated) {
        // First message must be auth (existing device) or pair (new device)
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          sendEvent(ws, { type: "error", message: "Invalid JSON" });
          ws.close(4000, "Invalid JSON");
          pendingConnections.delete(ws);
          return;
        }

        // Try auth first
        const authResult = wsAuthEventSchema.safeParse(parsed);
        if (authResult.success) {
          const deviceId = authResult.data.token;
          const device = getDevice(deviceId);
          if (!device) {
            sendEvent(ws, { type: "error", message: "Unknown device" });
            ws.close(4001, "Unknown device");
            pendingConnections.delete(ws);
            return;
          }

          // Close existing connection for this device if any
          const existing = connections.get(deviceId);
          if (existing) {
            existing.ws.close(4002, "Replaced by new connection");
            connections.delete(deviceId);
          }

          authenticated = true;
          pendingConnections.delete(ws);
          connections.set(deviceId, {
            deviceId,
            ws,
            lastHeartbeat: Date.now(),
          });
          setDeviceOnline(deviceId, true);
          return;
        }

        // Try pair
        const pairResult = wsPairEventSchema.safeParse(parsed);
        if (pairResult.success) {
          const { code, deviceName, devicePlatform, pushToken } = pairResult.data;
          const redeemResult = redeemPairingCode(code, {
            name: deviceName,
            platform: devicePlatform as DevicePlatform,
            pushToken,
          });

          if (!redeemResult.success || !redeemResult.device) {
            sendEvent(ws, { type: "error", message: redeemResult.error ?? "Pairing failed" });
            ws.close(4003, "Pairing failed");
            pendingConnections.delete(ws);
            return;
          }

          const device = redeemResult.device;
          authenticated = true;
          pendingConnections.delete(ws);
          connections.set(device.deviceId, {
            deviceId: device.deviceId,
            ws,
            lastHeartbeat: Date.now(),
          });

          sendEvent(ws, { type: "paired", deviceId: device.deviceId });
          return;
        }

        // Neither auth nor pair
        sendEvent(ws, { type: "error", message: "First message must be auth or pair" });
        ws.close(4000, "Unauthorized");
        pendingConnections.delete(ws);
        return;
      }

      // Already authenticated — find deviceId
      const deviceId = findDeviceIdByWs(ws);
      if (!deviceId) {
        sendEvent(ws, { type: "error", message: "Connection not associated with device" });
        return;
      }

      handleClientMessage(ws, deviceId, raw);
    });

    ws.on("close", () => {
      pendingConnections.delete(ws);
      const deviceId = findDeviceIdByWs(ws);
      if (deviceId) {
        removeConnection(deviceId);
      }
    });

    ws.on("error", (err: unknown) => {
      console.error("Companion WebSocket error:", err);
      pendingConnections.delete(ws);
      const deviceId = findDeviceIdByWs(ws);
      if (deviceId) {
        removeConnection(deviceId);
      }
    });
  }

  function findDeviceIdByWs(ws: WebSocketLike): string | undefined {
    for (const [deviceId, conn] of connections) {
      if (conn.ws === ws) return deviceId;
    }
    return undefined;
  }

  function startHeartbeatChecker(): void {
    heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [deviceId, conn] of connections) {
        if (now - conn.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
          console.log(`Companion device ${deviceId} heartbeat timeout — marking offline`);
          setDeviceOnline(deviceId, false);
          conn.ws.close(4004, "Heartbeat timeout");
          connections.delete(deviceId);
        }
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);

    if (heartbeatTimer.unref) {
      heartbeatTimer.unref();
    }
  }

  async function start(): Promise<void> {
    // Dynamic import of ws package
    const { WebSocketServer } = await import("ws");

    httpServer = createServer();
    wss = new WebSocketServer({ server: httpServer }) as unknown as typeof wss;

    (wss as unknown as { on: (event: string, cb: (ws: WebSocketLike) => void) => void })
      .on("connection", handleNewConnection);

    await new Promise<void>((resolve) => {
      httpServer!.listen(port, () => {
        console.log(`Companion WebSocket server started on port ${port}`);
        resolve();
      });
    });

    startHeartbeatChecker();
  }

  async function stop(): Promise<void> {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    // Close all client connections
    for (const [deviceId, conn] of connections) {
      try {
        conn.ws.close(1001, "Server shutting down");
      } catch {
        // Ignore close errors
      }
      setDeviceOnline(deviceId, false);
    }
    connections.clear();

    // Close pending connections
    for (const ws of pendingConnections) {
      try {
        ws.close(1001, "Server shutting down");
      } catch {
        // Ignore
      }
    }
    pendingConnections.clear();

    // Close WebSocket server
    if (wss) {
      wss.close();
      wss = null;
    }

    // Close HTTP server
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer!.close(() => resolve());
      });
      httpServer = null;
    }
  }

  /**
   * Send a push notification to offline devices when a new message arrives.
   */
  async function notifyOfflineDevices(title: string, body: string): Promise<void> {
    if (!pushDispatcher || !pushDispatcher.isConfigured()) return;

    const offlineDevices = getOfflineDevicesWithPush();
    if (offlineDevices.length === 0) return;

    const results = await pushDispatcher.sendPushToOffline(offlineDevices, {
      title,
      body,
    });

    for (const result of results) {
      if (!result.success) {
        console.error(`Push notification failed for device ${result.deviceId}: ${result.error}`);
      }
    }
  }

  return {
    start,
    stop,
    sendToDevice,
    broadcastToAll,
    sendEvent,
    notifyOfflineDevices,
    isDeviceConnected(deviceId: string): boolean {
      return connections.has(deviceId);
    },
    connectedCount(): number {
      return connections.size;
    },
    /** Expose handleNewConnection for testing without starting HTTP server */
    _handleNewConnection: handleNewConnection,
    /** Expose connections for testing */
    _getConnections(): ReadonlyMap<string, ClientConnection> {
      return connections;
    },
  };
}

export type CompanionWSServer = ReturnType<typeof createCompanionWSServer>;
