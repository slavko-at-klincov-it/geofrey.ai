import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
  tokenCachePath: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string;
}

let googleConfig: GoogleAuthConfig | null = null;

export function setGoogleConfig(config: GoogleAuthConfig): void {
  googleConfig = config;
}

export function getGoogleConfig(): GoogleAuthConfig | null {
  return googleConfig;
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Build the OAuth2 authorization URL.
 */
export function getAuthUrl(scopes: string[]): string {
  if (!googleConfig) throw new Error("Google not configured — call setGoogleConfig() first");

  const params = new URLSearchParams({
    client_id: googleConfig.clientId,
    redirect_uri: googleConfig.redirectUrl,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCode(code: string): Promise<TokenSet> {
  if (!googleConfig) throw new Error("Google not configured — call setGoogleConfig() first");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleConfig.clientId,
      client_secret: googleConfig.clientSecret,
      redirect_uri: googleConfig.redirectUrl,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  const tokenSet: TokenSet = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: data.scope,
  };

  saveTokenCache(tokenSet);
  return tokenSet;
}

/**
 * Refresh an expired access token.
 */
export async function refreshToken(token: string): Promise<TokenSet> {
  if (!googleConfig) throw new Error("Google not configured — call setGoogleConfig() first");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: token,
      client_id: googleConfig.clientId,
      client_secret: googleConfig.clientSecret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json() as {
    access_token: string;
    expires_in: number;
    scope: string;
  };

  const tokenSet: TokenSet = {
    accessToken: data.access_token,
    refreshToken: token, // refresh token stays the same
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: data.scope,
  };

  saveTokenCache(tokenSet);
  return tokenSet;
}

function saveTokenCache(tokenSet: TokenSet): void {
  if (!googleConfig) return;
  try {
    const dir = dirname(googleConfig.tokenCachePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(googleConfig.tokenCachePath, JSON.stringify(tokenSet, null, 2));
  } catch {
    // Non-critical: token cache save failure
  }
}

function loadTokenCache(): TokenSet | null {
  if (!googleConfig) return null;
  try {
    if (!existsSync(googleConfig.tokenCachePath)) return null;
    const raw = readFileSync(googleConfig.tokenCachePath, "utf-8");
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

/**
 * Get a valid access token, auto-refreshing if expired.
 */
export async function getValidToken(): Promise<string> {
  const cached = loadTokenCache();
  if (!cached) {
    throw new Error("No Google token available — authenticate first via the gmail or calendar tool");
  }

  // Refresh if expires within 5 minutes
  if (Date.now() > cached.expiresAt - 300_000) {
    if (!cached.refreshToken) {
      throw new Error("Token expired and no refresh token available — re-authenticate");
    }
    const refreshed = await refreshToken(cached.refreshToken);
    return refreshed.accessToken;
  }

  return cached.accessToken;
}

let callbackServer: Server | null = null;

/**
 * Start a temporary HTTP server to receive the OAuth callback.
 * Returns a promise that resolves with the authorization code.
 */
export function startOAuthCallbackServer(port = 3004): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopOAuthCallbackServer();
      reject(new Error("OAuth callback timeout (5 minutes)"));
    }, 300_000);

    callbackServer = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
        clearTimeout(timeout);
        stopOAuthCallbackServer();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Authorization successful!</h1><p>You can close this window.</p>");
        clearTimeout(timeout);
        stopOAuthCallbackServer();
        resolve(code);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    callbackServer.listen(port, () => {
      console.log(`OAuth callback server listening on port ${port}`);
    });

    callbackServer.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export function stopOAuthCallbackServer(): void {
  if (callbackServer) {
    callbackServer.close();
    callbackServer = null;
  }
}
