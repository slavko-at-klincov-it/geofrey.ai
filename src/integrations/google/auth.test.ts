import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  setGoogleConfig,
  getAuthUrl,
  exchangeCode,
  refreshToken,
  stopOAuthCallbackServer,
} from "./auth.js";

const TEST_CONFIG = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUrl: "http://localhost:3004/oauth/callback",
  tokenCachePath: "/tmp/geofrey-test-tokens.json",
};

describe("google auth", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    setGoogleConfig(TEST_CONFIG);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    stopOAuthCallbackServer();
    mock.restoreAll();
  });

  it("getAuthUrl builds correct URL", () => {
    const url = getAuthUrl(["https://www.googleapis.com/auth/gmail.modify"]);
    assert.ok(url.includes("accounts.google.com"));
    assert.ok(url.includes("test-client-id"));
    assert.ok(url.includes("gmail.modify"));
    assert.ok(url.includes("offline"));
  });

  it("getAuthUrl throws when not configured", () => {
    setGoogleConfig(null as any);
    assert.throws(() => getAuthUrl(["scope"]));
  });

  it("exchangeCode sends correct request", async () => {
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body?.toString() ?? "";
      return {
        ok: true,
        json: async () => ({
          access_token: "access-123",
          refresh_token: "refresh-456",
          expires_in: 3600,
          scope: "gmail.modify",
        }),
      } as Response;
    }) as typeof fetch;

    const tokens = await exchangeCode("auth-code-789");
    assert.equal(tokens.accessToken, "access-123");
    assert.equal(tokens.refreshToken, "refresh-456");
    assert.ok(tokens.expiresAt > Date.now());
    assert.ok(capturedBody.includes("auth-code-789"));
  });

  it("exchangeCode throws on API error", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => "invalid_grant",
    })) as unknown as typeof fetch;

    await assert.rejects(
      () => exchangeCode("bad-code"),
      (err: Error) => {
        assert.ok(err.message.includes("400"));
        return true;
      },
    );
  });

  it("refreshToken sends correct request", async () => {
    let capturedBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, opts?: RequestInit) => {
      capturedBody = opts?.body?.toString() ?? "";
      return {
        ok: true,
        json: async () => ({
          access_token: "new-access",
          expires_in: 3600,
          scope: "gmail.modify",
        }),
      } as Response;
    }) as typeof fetch;

    const tokens = await refreshToken("refresh-456");
    assert.equal(tokens.accessToken, "new-access");
    assert.equal(tokens.refreshToken, "refresh-456"); // preserved
    assert.ok(capturedBody.includes("refresh-456"));
  });

  it("refreshToken throws on API error", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "invalid_token",
    })) as unknown as typeof fetch;

    await assert.rejects(() => refreshToken("bad-token"));
  });
});
