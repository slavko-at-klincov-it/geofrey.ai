/**
 * Google OAuth2 flow — authorization URL, token exchange, auto-refresh.
 * Uses native fetch + node:http callback server. No googleapis dependency.
 */

import { createServer, type Server } from "node:http";
import { URL, URLSearchParams } from "node:url";
import { z } from "zod";

// ── Types ───────────────────────────────────────────────────────────────────

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  scopes: string[];
}

export interface TokenStore {
  getToken(chatId: string): Promise<StoredToken | null>;
  saveToken(chatId: string, token: StoredToken): Promise<void>;
}

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectPort: number;
  tokenStore: TokenStore;
}

// ── Constants ───────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export const ALL_SCOPES = [...GMAIL_SCOPES, ...CALENDAR_SCOPES] as const;

// ── Zod schemas for Google API responses ────────────────────────────────────

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  scope: z.string().optional(),
  token_type: z.string(),
});

const tokenRefreshResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  scope: z.string().optional(),
  token_type: z.string(),
});

// ── Auth URL ────────────────────────────────────────────────────────────────

export function getAuthUrl(config: GoogleAuthConfig, scopes: readonly string[], state?: string): string {
  const redirectUri = `http://localhost:${config.redirectPort}/oauth/callback`;
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  if (state) {
    params.set("state", state);
  }
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// ── Token Exchange ──────────────────────────────────────────────────────────

export async function exchangeCode(
  config: GoogleAuthConfig,
  code: string,
  scopes: readonly string[],
): Promise<StoredToken> {
  const redirectUri = `http://localhost:${config.redirectPort}/oauth/callback`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${body}`);
  }

  const raw = await res.json();
  const parsed = tokenResponseSchema.parse(raw);

  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? "",
    expiresAt: Date.now() + parsed.expires_in * 1000,
    scopes: parsed.scope ? parsed.scope.split(" ") : [...scopes],
  };
}

// ── Token Refresh ───────────────────────────────────────────────────────────

export async function refreshAccessToken(
  config: GoogleAuthConfig,
  stored: StoredToken,
): Promise<StoredToken> {
  if (!stored.refreshToken) {
    throw new Error("No refresh token available — re-authorization required");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: stored.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token refresh failed (${res.status}): ${body}`);
  }

  const raw = await res.json();
  const parsed = tokenRefreshResponseSchema.parse(raw);

  return {
    accessToken: parsed.access_token,
    refreshToken: stored.refreshToken, // refresh token stays the same
    expiresAt: Date.now() + parsed.expires_in * 1000,
    scopes: parsed.scope ? parsed.scope.split(" ") : stored.scopes,
  };
}

// ── Ensure Valid Token ──────────────────────────────────────────────────────

/**
 * Get a valid access token for the given chat ID.
 * Auto-refreshes if the token is expired or about to expire.
 * Returns null if no token exists (user needs to authorize).
 */
export async function getValidToken(
  config: GoogleAuthConfig,
  chatId: string,
): Promise<string | null> {
  const stored = await config.tokenStore.getToken(chatId);
  if (!stored) return null;

  // Check if token is still valid (with buffer)
  if (stored.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    return stored.accessToken;
  }

  // Token expired or expiring soon — refresh
  const refreshed = await refreshAccessToken(config, stored);
  await config.tokenStore.saveToken(chatId, refreshed);
  return refreshed.accessToken;
}

// ── OAuth Callback Server ───────────────────────────────────────────────────

interface OAuthCallbackResult {
  code: string;
  state?: string;
}

/**
 * Start a temporary HTTP server to receive the OAuth callback.
 * Returns a promise that resolves with the authorization code.
 * The server automatically shuts down after receiving the callback or on timeout.
 */
export function startOAuthCallbackServer(
  port: number,
  timeoutMs: number = 300_000,
): { promise: Promise<OAuthCallbackResult>; close: () => void } {
  let server: Server | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const promise = new Promise<OAuthCallbackResult>((resolve, reject) => {
    server = createServer((req, res) => {
      if (!req.url?.startsWith("/oauth/callback")) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      const url = new URL(req.url, `http://localhost:${port}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const state = url.searchParams.get("state") ?? undefined;

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body><h1>Authorization failed</h1><p>You can close this window.</p></body></html>");
        cleanup();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing authorization code");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<html><body><h1>Authorization successful!</h1><p>You can close this window and return to Geofrey.</p></body></html>");
      cleanup();
      resolve({ code, state });
    });

    server.listen(port, "localhost");

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`OAuth callback timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  function cleanup(): void {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (server) {
      server.close();
      server = null;
    }
  }

  return { promise, close: cleanup };
}

// ── Full OAuth Flow ─────────────────────────────────────────────────────────

/**
 * Run the full OAuth flow: generate URL, wait for callback, exchange code, store token.
 * Returns the authorization URL that the user must visit.
 * The token is automatically stored when the callback is received.
 */
export function startOAuthFlow(
  config: GoogleAuthConfig,
  chatId: string,
  scopes: readonly string[],
): { authUrl: string; promise: Promise<StoredToken>; close: () => void } {
  const state = chatId;
  const authUrl = getAuthUrl(config, scopes, state);
  const { promise: callbackPromise, close } = startOAuthCallbackServer(config.redirectPort);

  const promise = callbackPromise.then(async (result) => {
    const token = await exchangeCode(config, result.code, scopes);
    await config.tokenStore.saveToken(chatId, token);
    return token;
  });

  return { authUrl, promise, close };
}

// ── In-Memory Token Store (for testing / simple setups) ─────────────────────

export function createInMemoryTokenStore(): TokenStore {
  const tokens = new Map<string, StoredToken>();

  return {
    async getToken(chatId: string): Promise<StoredToken | null> {
      return tokens.get(chatId) ?? null;
    },
    async saveToken(chatId: string, token: StoredToken): Promise<void> {
      tokens.set(chatId, token);
    },
  };
}
