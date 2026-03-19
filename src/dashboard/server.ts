import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ShipmentManager } from "../shipments/manager.js";
import { vesselPositions } from "../db/schema.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

interface DashboardConfig {
  port: number;
  token?: string;
}

type SseClient = {
  res: ServerResponse;
  id: number;
};

export function createDashboardServer(
  config: DashboardConfig,
  manager: ShipmentManager,
  db: ReturnType<typeof import("../db/client.js").getDb>,
) {
  const sseClients: SseClient[] = [];
  let clientIdCounter = 0;

  function checkAuth(req: IncomingMessage): boolean {
    if (!config.token) return true;
    const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);
    return url.searchParams.get("token") === config.token
      || req.headers.authorization === `Bearer ${config.token}`;
  }

  function sendJson(res: ServerResponse, data: unknown, status = 200) {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(data));
  }

  function sendNotFound(res: ServerResponse) {
    res.writeHead(404);
    res.end("Not found");
  }

  // Broadcast SSE event to all connected clients
  function broadcast(event: string, data: unknown) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      client.res.write(payload);
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);
    const path = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization",
      });
      res.end();
      return;
    }

    // Auth check for API routes
    if (path.startsWith("/api/") && !checkAuth(req)) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    // SSE endpoint
    if (path === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      const clientId = clientIdCounter++;
      const client: SseClient = { res, id: clientId };
      sseClients.push(client);
      req.on("close", () => {
        const idx = sseClients.findIndex((c) => c.id === clientId);
        if (idx !== -1) sseClients.splice(idx, 1);
      });
      // Send initial data
      res.write(`event: init\ndata: ${JSON.stringify({ connected: true })}\n\n`);
      return;
    }

    // REST API
    if (path === "/api/shipments" && req.method === "GET") {
      // chatId param is optional — if omitted, return all
      const chatId = url.searchParams.get("chatId");
      const data = chatId ? manager.listShipments(chatId) : manager.listAllActive();
      sendJson(res, data);
      return;
    }

    if (path.startsWith("/api/shipments/") && req.method === "GET") {
      const id = path.slice("/api/shipments/".length);
      const shipment = manager.getShipment(id);
      if (!shipment) { sendNotFound(res); return; }
      const events = manager.getEvents(id);
      sendJson(res, { ...shipment, events });
      return;
    }

    if (path === "/api/vessels" && req.method === "GET") {
      const vessels = db.select().from(vesselPositions).all();
      sendJson(res, vessels);
      return;
    }

    // Static files
    let filePath = path === "/" ? "/index.html" : path;
    // Prevent directory traversal
    if (filePath.includes("..")) { sendNotFound(res); return; }

    try {
      const fullPath = join(PUBLIC_DIR, filePath);
      const content = await readFile(fullPath);
      const ext = extname(filePath);
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-cache" : "max-age=3600",
      });
      res.end(content);
    } catch {
      sendNotFound(res);
    }
  });

  return {
    broadcast,
    start() {
      return new Promise<void>((resolve) => {
        server.listen(config.port, () => {
          console.log(`Dashboard: http://localhost:${config.port}`);
          resolve();
        });
      });
    },
    stop() {
      return new Promise<void>((resolve, reject) => {
        for (const client of sseClients) {
          client.res.end();
        }
        sseClients.length = 0;
        server.close((err) => err ? reject(err) : resolve());
      });
    },
  };
}

export type DashboardServer = ReturnType<typeof createDashboardServer>;
