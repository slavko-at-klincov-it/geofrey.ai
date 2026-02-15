import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Classification } from "../../approval/risk-classifier.js";
import type { MessagingPlatform, PlatformCallbacks, ChatId, MessageRef } from "../platform.js";
import { t } from "../../i18n/index.js";

interface DashboardConfig {
  enabled: boolean;
  port: number;
  token?: string;
}

interface SSEEvent {
  type: "message" | "approval" | "status" | "edit";
  data: unknown;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const WEBCHAT_CHAT_ID = "webchat";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

export function formatSSEEvent(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function createWebChatPlatform(
  config: DashboardConfig,
  callbacks: PlatformCallbacks,
): MessagingPlatform {
  let server: Server | null = null;
  let msgCounter = 0;
  const startTime = Date.now();

  // Rate limiting per IP
  const rateLimits = new Map<string, { count: number; resetAt: number }>();

  function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimits.get(ip);
    if (!entry || now > entry.resetAt) {
      rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return true;
    }
    entry.count++;
    return entry.count <= RATE_LIMIT_MAX_REQUESTS;
  }

  // SSE client connections
  const sseClients = new Set<ServerResponse>();

  // Message history for new SSE clients
  const messageHistory: Array<{ id: string; role: "user" | "assistant"; text: string; timestamp: number }> = [];

  // Pending approval requests
  const pendingApprovals = new Map<string, {
    nonce: string;
    toolName: string;
    args: Record<string, unknown>;
    classification: Classification;
  }>();

  function broadcast(event: SSEEvent): void {
    const formatted = formatSSEEvent(event);
    for (const client of sseClients) {
      try {
        client.write(formatted);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  function checkAuth(req: IncomingMessage): boolean {
    if (!config.token) return true;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7) === config.token;
    }
    // Also check query parameter for SSE connections
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const queryToken = url.searchParams.get("token");
    return queryToken === config.token;
  }

  async function readRequestBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf-8");
  }

  function sendJson(res: ServerResponse, status: number, data: unknown): void {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(body);
  }

  async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    let pathname = url.pathname;
    if (pathname === "/") pathname = "/index.html";

    const publicDir = join(fileURLToPath(import.meta.url), "..", "..", "..", "dashboard", "public");
    const filePath = join(publicDir, pathname);

    // Prevent path traversal
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end();
      return;
    }

    try {
      const content = await readFile(filePath);
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    // Health check (no auth required)
    if (pathname === "/health" && req.method === "GET") {
      sendJson(res, 200, { status: "ok", uptime: Math.floor((Date.now() - startTime) / 1000) });
      return;
    }

    // API routes require auth + rate limiting
    if (pathname.startsWith("/api/")) {
      if (!checkAuth(req)) {
        sendJson(res, 401, { error: t("dashboard.unauthorized") });
        return;
      }

      const clientIp = req.socket.remoteAddress ?? "unknown";
      if (!checkRateLimit(clientIp)) {
        sendJson(res, 429, { error: "Rate limit exceeded" });
        return;
      }

      // SSE endpoint
      if (pathname === "/api/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });

        // Send message history
        for (const msg of messageHistory) {
          res.write(formatSSEEvent({ type: "message", data: msg }));
        }

        // Send pending approvals
        for (const [, approval] of pendingApprovals) {
          res.write(formatSSEEvent({
            type: "approval",
            data: approval,
          }));
        }

        sseClients.add(res);
        console.log(t("dashboard.connected"));

        req.on("close", () => {
          sseClients.delete(res);
          console.log(t("dashboard.disconnected"));
        });
        return;
      }

      // Send message
      if (pathname === "/api/message" && req.method === "POST") {
        try {
          const body = JSON.parse(await readRequestBody(req)) as { text?: string };
          if (!body.text || typeof body.text !== "string") {
            sendJson(res, 400, { error: "Missing text field" });
            return;
          }

          // Store user message in history
          const userMsg = {
            id: String(++msgCounter),
            role: "user" as const,
            text: body.text,
            timestamp: Date.now(),
          };
          messageHistory.push(userMsg);
          broadcast({ type: "message", data: userMsg });

          sendJson(res, 200, { ok: true });

          // Process via orchestrator asynchronously
          callbacks.onMessage(WEBCHAT_CHAT_ID, body.text).catch((err) => {
            console.error("WebChat message handler error:", err);
          });
        } catch {
          sendJson(res, 400, { error: "Invalid JSON" });
        }
        return;
      }

      // Approval response
      const approvalMatch = pathname.match(/^\/api\/approval\/([a-zA-Z0-9_-]+)$/);
      if (approvalMatch && req.method === "POST") {
        try {
          const nonce = approvalMatch[1];
          const body = JSON.parse(await readRequestBody(req)) as { approved?: boolean };
          if (typeof body.approved !== "boolean") {
            sendJson(res, 400, { error: "Missing approved field" });
            return;
          }

          pendingApprovals.delete(nonce);
          broadcast({ type: "approval", data: { nonce, resolved: true, approved: body.approved } });

          sendJson(res, 200, { ok: true });

          callbacks.onApprovalResponse(nonce, body.approved).catch((err) => {
            console.error("WebChat approval handler error:", err);
          });
        } catch {
          sendJson(res, 400, { error: "Invalid JSON" });
        }
        return;
      }

      // Agent status
      if (pathname === "/api/status" && req.method === "GET") {
        sendJson(res, 200, {
          platform: "webchat",
          uptime: Math.floor((Date.now() - startTime) / 1000),
          connectedClients: sseClients.size,
          pendingApprovals: pendingApprovals.size,
          messageCount: messageHistory.length,
        });
        return;
      }

      // Audit log (reads recent JSONL entries)
      if (pathname === "/api/audit" && req.method === "GET") {
        try {
          const { readdir, readFile: readFileFs } = await import("node:fs/promises");
          const auditDir = join(process.cwd(), "data", "audit");
          const files = (await readdir(auditDir)).filter(f => f.endsWith(".jsonl")).sort();
          const entries: unknown[] = [];

          // Read last file, take last 50 entries
          if (files.length > 0) {
            const lastFile = join(auditDir, files[files.length - 1]);
            const content = await readFileFs(lastFile, "utf-8");
            const lines = content.trim().split("\n").filter(Boolean);
            const recent = lines.slice(-50);
            for (const line of recent) {
              try {
                entries.push(JSON.parse(line));
              } catch {
                // skip malformed lines
              }
            }
          }

          sendJson(res, 200, { entries });
        } catch {
          sendJson(res, 200, { entries: [] });
        }
        return;
      }

      // Unknown API route
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    // Static file serving
    await serveStatic(req, res);
  }

  return {
    name: "webchat",
    maxMessageLength: 100_000, // Browser can handle long messages
    supportsEdit: true,

    async sendMessage(_chatId: ChatId, text: string): Promise<MessageRef> {
      const id = String(++msgCounter);
      const msg = {
        id,
        role: "assistant" as const,
        text,
        timestamp: Date.now(),
      };
      messageHistory.push(msg);
      broadcast({ type: "message", data: msg });
      return id;
    },

    async editMessage(_chatId: ChatId, ref: MessageRef, text: string): Promise<MessageRef> {
      // Update in history
      const existing = messageHistory.find(m => m.id === ref);
      if (existing) {
        existing.text = text;
      }
      broadcast({ type: "edit", data: { id: ref, text, timestamp: Date.now() } });
      return ref;
    },

    async sendApproval(
      _chatId: ChatId,
      nonce: string,
      toolName: string,
      args: Record<string, unknown>,
      classification: Classification,
    ): Promise<void> {
      const approval = { nonce, toolName, args, classification };
      pendingApprovals.set(nonce, approval);
      broadcast({ type: "approval", data: approval });
    },

    async start(): Promise<void> {
      return new Promise((resolve) => {
        server = createServer((req, res) => {
          handleRequest(req, res).catch((err) => {
            console.error("WebChat request error:", err);
            if (!res.headersSent) {
              res.writeHead(500);
              res.end();
            }
          });
        });
        server.listen(config.port, () => {
          console.log(t("dashboard.started", { port: config.port }));
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      // Close all SSE connections
      for (const client of sseClients) {
        try {
          client.end();
        } catch {
          // ignore
        }
      }
      sseClients.clear();
      pendingApprovals.clear();

      if (server) {
        return new Promise((resolve) => {
          server!.close(() => resolve());
        });
      }
    },
  };
}
