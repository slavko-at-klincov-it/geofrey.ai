import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  getAuthUrl,
  exchangeCode,
  refreshAccessToken,
  getValidToken,
  startOAuthCallbackServer,
  createInMemoryTokenStore,
  GMAIL_SCOPES,
  CALENDAR_SCOPES,
  ALL_SCOPES,
  type GoogleAuthConfig,
  type StoredToken,
  type TokenStore,
} from "./auth.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<GoogleAuthConfig> = {}): GoogleAuthConfig {
  return {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    redirectPort: 3099,
    tokenStore: createInMemoryTokenStore(),
    ...overrides,
  };
}

function makeToken(overrides: Partial<StoredToken> = {}): StoredToken {
  return {
    accessToken: "ya29.test-access-token",
    refreshToken: "1//test-refresh-token",
    expiresAt: Date.now() + 3600 * 1000,
    scopes: [...ALL_SCOPES],
    ...overrides,
  };
}

function mockFetchSuccess(body: unknown): typeof fetch {
  return mock.fn(async () => ({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

function mockFetchError(status: number, body: string): typeof fetch {
  return mock.fn(async () => ({
    ok: false,
    status,
    text: async () => body,
  })) as unknown as typeof fetch;
}

// ── Scope Constants ─────────────────────────────────────────────────────────

describe("scope constants", () => {
  it("defines Gmail scopes", () => {
    assert.equal(GMAIL_SCOPES.length, 3);
    assert.ok(GMAIL_SCOPES.some((s) => s.includes("gmail.readonly")));
    assert.ok(GMAIL_SCOPES.some((s) => s.includes("gmail.send")));
    assert.ok(GMAIL_SCOPES.some((s) => s.includes("gmail.modify")));
  });

  it("defines Calendar scopes", () => {
    assert.equal(CALENDAR_SCOPES.length, 2);
    assert.ok(CALENDAR_SCOPES.some((s) => s.includes("calendar.readonly")));
    assert.ok(CALENDAR_SCOPES.some((s) => s.includes("calendar.events")));
  });

  it("ALL_SCOPES combines Gmail and Calendar", () => {
    assert.equal(ALL_SCOPES.length, GMAIL_SCOPES.length + CALENDAR_SCOPES.length);
  });
});

// ── getAuthUrl ──────────────────────────────────────────────────────────────

describe("getAuthUrl", () => {
  it("builds a valid Google OAuth2 URL", () => {
    const config = makeConfig();
    const url = getAuthUrl(config, GMAIL_SCOPES);

    assert.ok(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"));
    assert.ok(url.includes("client_id=test-client-id"));
    assert.ok(url.includes("response_type=code"));
    assert.ok(url.includes("access_type=offline"));
    assert.ok(url.includes("prompt=consent"));
    assert.ok(url.includes("redirect_uri="));
    assert.ok(url.includes(encodeURIComponent("gmail.readonly")));
  });

  it("includes redirect port in redirect_uri", () => {
    const config = makeConfig({ redirectPort: 9999 });
    const url = getAuthUrl(config, GMAIL_SCOPES);
    assert.ok(url.includes(encodeURIComponent("http://localhost:9999/oauth/callback")));
  });

  it("includes state parameter when provided", () => {
    const config = makeConfig();
    const url = getAuthUrl(config, GMAIL_SCOPES, "chat-123");
    assert.ok(url.includes("state=chat-123"));
  });

  it("omits state parameter when not provided", () => {
    const config = makeConfig();
    const url = getAuthUrl(config, GMAIL_SCOPES);
    assert.ok(!url.includes("state="));
  });

  it("joins multiple scopes with space", () => {
    const config = makeConfig();
    const url = getAuthUrl(config, ALL_SCOPES);
    // URL-encoded space is either + or %20
    assert.ok(url.includes("scope="));
  });
});

// ── exchangeCode ────────────────────────────────────────────────────────────

describe("exchangeCode", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("exchanges code for tokens", async () => {
    globalThis.fetch = mockFetchSuccess({
      access_token: "ya29.new-access",
      refresh_token: "1//new-refresh",
      expires_in: 3600,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      token_type: "Bearer",
    });

    const config = makeConfig();
    const token = await exchangeCode(config, "auth-code-123", GMAIL_SCOPES);

    assert.equal(token.accessToken, "ya29.new-access");
    assert.equal(token.refreshToken, "1//new-refresh");
    assert.ok(token.expiresAt > Date.now());
    assert.ok(token.scopes.length > 0);
  });

  it("uses provided scopes when response scope is missing", async () => {
    globalThis.fetch = mockFetchSuccess({
      access_token: "ya29.access",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const config = makeConfig();
    const token = await exchangeCode(config, "code", GMAIL_SCOPES);

    assert.deepEqual(token.scopes, [...GMAIL_SCOPES]);
    assert.equal(token.refreshToken, "");
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError(400, "invalid_grant");

    const config = makeConfig();
    await assert.rejects(
      () => exchangeCode(config, "bad-code", GMAIL_SCOPES),
      (err: Error) => {
        assert.ok(err.message.includes("400"));
        assert.ok(err.message.includes("invalid_grant"));
        return true;
      },
    );
  });

  it("sends correct request parameters", async () => {
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body as string;
      return {
        ok: true,
        json: async () => ({
          access_token: "ya29.x",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      };
    }) as unknown as typeof fetch;

    const config = makeConfig();
    await exchangeCode(config, "the-code", GMAIL_SCOPES);

    const params = new URLSearchParams(capturedBody);
    assert.equal(params.get("code"), "the-code");
    assert.equal(params.get("client_id"), "test-client-id");
    assert.equal(params.get("client_secret"), "test-client-secret");
    assert.equal(params.get("grant_type"), "authorization_code");
    assert.ok(params.get("redirect_uri")?.includes("localhost:3099"));
  });
});

// ── refreshAccessToken ──────────────────────────────────────────────────────

describe("refreshAccessToken", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("refreshes an expired token", async () => {
    globalThis.fetch = mockFetchSuccess({
      access_token: "ya29.refreshed",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const config = makeConfig();
    const stored = makeToken({ expiresAt: Date.now() - 1000 });
    const refreshed = await refreshAccessToken(config, stored);

    assert.equal(refreshed.accessToken, "ya29.refreshed");
    assert.equal(refreshed.refreshToken, stored.refreshToken);
    assert.ok(refreshed.expiresAt > Date.now());
  });

  it("preserves original refresh token", async () => {
    globalThis.fetch = mockFetchSuccess({
      access_token: "ya29.new",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const config = makeConfig();
    const stored = makeToken({ refreshToken: "1//original-refresh" });
    const refreshed = await refreshAccessToken(config, stored);

    assert.equal(refreshed.refreshToken, "1//original-refresh");
  });

  it("throws when no refresh token", async () => {
    const config = makeConfig();
    const stored = makeToken({ refreshToken: "" });

    await assert.rejects(
      () => refreshAccessToken(config, stored),
      (err: Error) => {
        assert.ok(err.message.includes("refresh token"));
        return true;
      },
    );
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError(401, "Token has been revoked");

    const config = makeConfig();
    const stored = makeToken();

    await assert.rejects(
      () => refreshAccessToken(config, stored),
      (err: Error) => {
        assert.ok(err.message.includes("401"));
        return true;
      },
    );
  });
});

// ── getValidToken ───────────────────────────────────────────────────────────

describe("getValidToken", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("returns null when no token stored", async () => {
    const config = makeConfig();
    const result = await getValidToken(config, "chat-1");
    assert.equal(result, null);
  });

  it("returns cached access token when not expired", async () => {
    const store = createInMemoryTokenStore();
    const token = makeToken({ expiresAt: Date.now() + 3600 * 1000 });
    await store.saveToken("chat-1", token);

    const config = makeConfig({ tokenStore: store });
    const result = await getValidToken(config, "chat-1");

    assert.equal(result, token.accessToken);
  });

  it("auto-refreshes expired token", async () => {
    globalThis.fetch = mockFetchSuccess({
      access_token: "ya29.auto-refreshed",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const store = createInMemoryTokenStore();
    const expired = makeToken({ expiresAt: Date.now() - 1000 });
    await store.saveToken("chat-1", expired);

    const config = makeConfig({ tokenStore: store });
    const result = await getValidToken(config, "chat-1");

    assert.equal(result, "ya29.auto-refreshed");

    // Verify the new token was saved
    const saved = await store.getToken("chat-1");
    assert.equal(saved?.accessToken, "ya29.auto-refreshed");
  });

  it("refreshes token when within 5-minute buffer", async () => {
    globalThis.fetch = mockFetchSuccess({
      access_token: "ya29.buffer-refreshed",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const store = createInMemoryTokenStore();
    // Expires in 2 minutes (within 5-minute buffer)
    const almostExpired = makeToken({ expiresAt: Date.now() + 2 * 60 * 1000 });
    await store.saveToken("chat-1", almostExpired);

    const config = makeConfig({ tokenStore: store });
    const result = await getValidToken(config, "chat-1");

    assert.equal(result, "ya29.buffer-refreshed");
  });
});

// ── InMemoryTokenStore ──────────────────────────────────────────────────────

describe("createInMemoryTokenStore", () => {
  it("stores and retrieves tokens", async () => {
    const store = createInMemoryTokenStore();
    const token = makeToken();

    await store.saveToken("chat-1", token);
    const retrieved = await store.getToken("chat-1");

    assert.deepEqual(retrieved, token);
  });

  it("returns null for unknown chat ID", async () => {
    const store = createInMemoryTokenStore();
    const result = await store.getToken("unknown");
    assert.equal(result, null);
  });

  it("overwrites existing token", async () => {
    const store = createInMemoryTokenStore();
    await store.saveToken("chat-1", makeToken({ accessToken: "old" }));
    await store.saveToken("chat-1", makeToken({ accessToken: "new" }));

    const retrieved = await store.getToken("chat-1");
    assert.equal(retrieved?.accessToken, "new");
  });

  it("stores tokens per chat ID independently", async () => {
    const store = createInMemoryTokenStore();
    await store.saveToken("chat-1", makeToken({ accessToken: "token-1" }));
    await store.saveToken("chat-2", makeToken({ accessToken: "token-2" }));

    const t1 = await store.getToken("chat-1");
    const t2 = await store.getToken("chat-2");

    assert.equal(t1?.accessToken, "token-1");
    assert.equal(t2?.accessToken, "token-2");
  });
});

// ── OAuth Callback Server ───────────────────────────────────────────────────

describe("startOAuthCallbackServer", () => {
  it("receives authorization code via callback", async () => {
    const { promise, close } = startOAuthCallbackServer(3098, 5000);

    try {
      // Simulate OAuth callback
      const res = await fetch("http://localhost:3098/oauth/callback?code=test-auth-code&state=chat-1");
      assert.equal(res.status, 200);

      const result = await promise;
      assert.equal(result.code, "test-auth-code");
      assert.equal(result.state, "chat-1");
    } finally {
      close();
    }
  });

  it("returns 404 for non-callback paths", async () => {
    const { promise, close } = startOAuthCallbackServer(3097, 5000);

    try {
      const res = await fetch("http://localhost:3097/other-path");
      assert.equal(res.status, 404);
    } finally {
      close();
      // Clean up the promise (it will reject on close, which is fine)
      promise.catch(() => {});
    }
  });

  it("rejects on OAuth error", async () => {
    const { promise, close } = startOAuthCallbackServer(3096, 5000);

    // Attach rejection handler before triggering the error to avoid unhandled rejection
    const rejectionPromise = assert.rejects(
      promise,
      (err: Error) => {
        assert.ok(err.message.includes("access_denied"));
        return true;
      },
    );

    try {
      await fetch("http://localhost:3096/oauth/callback?error=access_denied");
      await rejectionPromise;
    } finally {
      close();
    }
  });

  it("returns 400 when code is missing", async () => {
    const { promise, close } = startOAuthCallbackServer(3095, 5000);

    try {
      const res = await fetch("http://localhost:3095/oauth/callback");
      assert.equal(res.status, 400);
    } finally {
      close();
      promise.catch(() => {});
    }
  });
});
