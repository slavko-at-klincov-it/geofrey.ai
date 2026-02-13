import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { WebhookRouter } from "./router.js";
import type { WebhookHandler } from "./handler.js";

const MAX_BODY_SIZE = 1_048_576; // 1 MB

export interface WebhookServerOptions {
  port: number;
  router: WebhookRouter;
  handler: WebhookHandler;
}

export interface WebhookServer {
  server: Server;
  stop: () => Promise<void>;
  start: () => Promise<void>;
  port: number;
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    req.on("error", reject);
  });
}

function parseJsonBody(raw: string, contentType: string | undefined): Record<string, unknown> | null {
  if (contentType?.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  if (contentType?.includes("application/x-www-form-urlencoded")) {
    try {
      const params = new URLSearchParams(raw);
      const obj: Record<string, unknown> = {};
      for (const [key, value] of params) {
        obj[key] = value;
      }
      return obj;
    } catch {
      return null;
    }
  }

  // Try JSON as fallback
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON either
  }

  return null;
}

function respond(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function extractHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value[0];
    }
  }
  return headers;
}

export function startWebhookServer(options: WebhookServerOptions): WebhookServer {
  const { port, router, handler } = options;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      respond(res, 404, { error: "Not found" });
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const pathname = url.pathname;

    // Match webhook route
    const webhook = router.match(pathname);
    if (!webhook) {
      respond(res, 404, { error: "Webhook not found" });
      return;
    }

    // Parse body
    let rawBody: string;
    try {
      rawBody = await parseBody(req);
    } catch {
      respond(res, 400, { error: "Invalid request body" });
      return;
    }

    // Authenticate
    if (!router.authenticate(webhook, req, rawBody)) {
      respond(res, 401, { error: "Unauthorized" });
      return;
    }

    // Rate limit
    if (!router.checkRateLimit(webhook.id)) {
      respond(res, 429, { error: "Rate limit exceeded" });
      return;
    }

    // Parse JSON/form body
    const contentType = req.headers["content-type"];
    const body = parseJsonBody(rawBody, contentType);
    if (!body) {
      respond(res, 400, { error: "Invalid JSON or form body" });
      return;
    }

    // Handle webhook
    const headers = extractHeaders(req);
    const result = await handler.handle(webhook, body, headers);

    if (result.status === "ok") {
      respond(res, 200, { status: "ok", message: result.message });
    } else {
      respond(res, 200, { status: "error", message: result.message });
    }
  });

  function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
  }

  function stop(): Promise<void> {
    return new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  return { server, start, stop, port };
}
