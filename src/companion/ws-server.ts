import { WebSocketServer, WebSocket } from "ws";
import { getDevice, registerDevice, listDevices } from "./device-registry.js";
import { verifyPairing } from "./pairing.js";
import type { Device } from "./device-registry.js";

export interface CompanionServerConfig {
  wsPort: number;
  pairingTtlMs: number;
  heartbeatIntervalMs?: number;
}

interface AuthenticatedConnection {
  ws: WebSocket;
  deviceId: string;
  lastPong: number;
}

export interface CompanionServer {
  stop: () => Promise<void>;
  getConnections: () => number;
  broadcast: (message: object) => void;
}

export async function startCompanionServer(config: CompanionServerConfig): Promise<CompanionServer> {
  const heartbeatInterval = config.heartbeatIntervalMs ?? 30_000;
  const connections = new Map<string, AuthenticatedConnection>();

  const wss = new WebSocketServer({ port: config.wsPort });

  function send(ws: WebSocket, message: object): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  wss.on("connection", (ws) => {
    let authenticated = false;
    let deviceId: string | null = null;

    // Expect authentication within 10 seconds
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        send(ws, { type: "error", message: "Authentication timeout" });
        ws.close();
      }
    }, 10_000);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type: string; [key: string]: unknown };

        if (!authenticated) {
          if (msg.type === "pair") {
            const code = typeof msg.code === "string" ? msg.code : "";
            const verifiedDeviceId = verifyPairing(code);
            if (!verifiedDeviceId) {
              send(ws, { type: "pair_response", success: false, error: "Invalid or expired code" });
              ws.close();
              return;
            }
            deviceId = verifiedDeviceId;
            authenticated = true;
            clearTimeout(authTimeout);
            connections.set(deviceId, { ws, deviceId, lastPong: Date.now() });
            send(ws, { type: "pair_response", success: true, deviceId });
          } else if (msg.type === "auth") {
            const id = typeof msg.deviceId === "string" ? msg.deviceId : "";
            const device = getDevice(id);
            if (!device || !device.paired) {
              send(ws, { type: "error", message: "Unknown device" });
              ws.close();
              return;
            }
            deviceId = id;
            authenticated = true;
            clearTimeout(authTimeout);
            connections.set(deviceId, { ws, deviceId, lastPong: Date.now() });
            send(ws, { type: "auth_response", success: true });
          } else {
            send(ws, { type: "error", message: "Authenticate first" });
          }
          return;
        }

        // Authenticated message handling
        if (msg.type === "pong") {
          const conn = deviceId ? connections.get(deviceId) : null;
          if (conn) conn.lastPong = Date.now();
        }
      } catch {
        send(ws, { type: "error", message: "Invalid message format" });
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      if (deviceId) connections.delete(deviceId);
    });

    ws.on("error", () => {
      clearTimeout(authTimeout);
      if (deviceId) connections.delete(deviceId);
    });
  });

  // Heartbeat: ping all connections, close stale ones
  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, conn] of connections) {
      if (now - conn.lastPong > heartbeatInterval * 2) {
        conn.ws.close();
        connections.delete(id);
      } else {
        send(conn.ws, { type: "ping" });
      }
    }
  }, heartbeatInterval);

  return {
    stop: () => new Promise<void>((resolve) => {
      clearInterval(heartbeatTimer);
      for (const conn of connections.values()) {
        conn.ws.close();
      }
      connections.clear();
      wss.close(() => resolve());
    }),
    getConnections: () => connections.size,
    broadcast: (message: object) => {
      for (const conn of connections.values()) {
        send(conn.ws, message);
      }
    },
  };
}
