import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { eq } from "drizzle-orm";
import { webhooks as webhooksTable } from "../db/schema.js";
import type { getDb } from "../db/client.js";

export interface WebhookEntry {
  id: string;
  name: string;
  path: string;
  secret: string | null;
  template: "github" | "stripe" | "generic" | null;
  enabled: boolean;
  chatId: string;
}

const DEFAULT_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

interface RateEntry {
  count: number;
  resetAt: number;
}

export interface WebhookRouter {
  register(webhook: WebhookEntry): void;
  unregister(id: string): void;
  match(path: string): WebhookEntry | undefined;
  authenticate(webhook: WebhookEntry, req: IncomingMessage, body: string): boolean;
  checkRateLimit(webhookId: string): boolean;
  listAll(): WebhookEntry[];
}

type Db = ReturnType<typeof getDb>;

export function createWebhookRouter(rateLimit = DEFAULT_RATE_LIMIT, db?: Db): WebhookRouter {
  const webhooks = new Map<string, WebhookEntry>();
  const rateLimits = new Map<string, RateEntry>();

  function register(webhook: WebhookEntry): void {
    webhooks.set(webhook.id, webhook);
    if (db) {
      try {
        db.insert(webhooksTable)
          .values({
            id: webhook.id,
            name: webhook.name,
            path: webhook.path,
            secret: webhook.secret,
            template: webhook.template,
            enabled: webhook.enabled,
            chatId: webhook.chatId,
            createdAt: new Date(),
          })
          .onConflictDoUpdate({
            target: webhooksTable.id,
            set: {
              name: webhook.name,
              path: webhook.path,
              secret: webhook.secret,
              template: webhook.template,
              enabled: webhook.enabled,
              chatId: webhook.chatId,
            },
          })
          .run();
      } catch (_) {
        // DB persistence is fire-and-forget
      }
    }
  }

  function unregister(id: string): void {
    webhooks.delete(id);
    rateLimits.delete(id);
    if (db) {
      try {
        db.delete(webhooksTable).where(eq(webhooksTable.id, id)).run();
      } catch (_) {
        // DB persistence is fire-and-forget
      }
    }
  }

  function match(path: string): WebhookEntry | undefined {
    for (const webhook of webhooks.values()) {
      if (webhook.path === path && webhook.enabled) {
        return webhook;
      }
    }
    return undefined;
  }

  function authenticate(webhook: WebhookEntry, req: IncomingMessage, body: string): boolean {
    if (!webhook.secret) return true;

    const hubSig = req.headers["x-hub-signature-256"];
    const directSecret = req.headers["x-webhook-secret"];

    if (typeof hubSig === "string") {
      const expected = "sha256=" + createHmac("sha256", webhook.secret).update(body).digest("hex");
      if (hubSig.length !== expected.length) return false;
      try {
        return timingSafeEqual(Buffer.from(hubSig), Buffer.from(expected));
      } catch {
        return false;
      }
    }

    if (typeof directSecret === "string") {
      const expectedBuf = Buffer.from(webhook.secret);
      const actualBuf = Buffer.from(directSecret);
      if (expectedBuf.length !== actualBuf.length) return false;
      try {
        return timingSafeEqual(expectedBuf, actualBuf);
      } catch {
        return false;
      }
    }

    return false;
  }

  function checkRateLimit(webhookId: string): boolean {
    const now = Date.now();
    const entry = rateLimits.get(webhookId);

    if (!entry || now >= entry.resetAt) {
      rateLimits.set(webhookId, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return true;
    }

    if (entry.count >= rateLimit) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  function listAll(): WebhookEntry[] {
    return Array.from(webhooks.values());
  }

  return { register, unregister, match, authenticate, checkRateLimit, listAll };
}

export function loadWebhooksFromDb(db: Db): WebhookEntry[] {
  const rows = db.select().from(webhooksTable).where(eq(webhooksTable.enabled, true)).all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    path: row.path,
    secret: row.secret,
    template: row.template,
    enabled: row.enabled,
    chatId: row.chatId,
  }));
}
