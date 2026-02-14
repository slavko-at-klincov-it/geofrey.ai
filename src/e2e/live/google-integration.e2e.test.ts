import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  setGoogleConfig,
  getAuthUrl,
  getValidToken,
} from "../../integrations/google/auth.js";
import { listMessages, sendMessage } from "../../integrations/google/gmail.js";
import { listEvents, createEvent } from "../../integrations/google/calendar.js";

describe("E2E: Google Integration (graceful failure)", { timeout: 30_000 }, () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "geofrey-e2e-google-"));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── Auth ─────────────────────────────────────────────────────────────

  describe("Google Auth", () => {
    it("setGoogleConfig accepts valid config without error", () => {
      assert.doesNotThrow(() => {
        setGoogleConfig({
          clientId: "123456789-abcdef.apps.googleusercontent.com",
          clientSecret: "GOCSPX-test-secret",
          redirectUrl: "http://localhost:3004/oauth/callback",
          tokenCachePath: join(tmpDir, "google-tokens.json"),
        });
      });
    });

    it("getAuthUrl returns a valid Google OAuth URL", () => {
      setGoogleConfig({
        clientId: "123456789-abcdef.apps.googleusercontent.com",
        clientSecret: "GOCSPX-test-secret",
        redirectUrl: "http://localhost:3004/oauth/callback",
        tokenCachePath: join(tmpDir, "google-tokens.json"),
      });

      const url = getAuthUrl([
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar.readonly",
      ]);

      assert.ok(
        url.startsWith("https://accounts.google.com"),
        `Auth URL should start with https://accounts.google.com, got: ${url.slice(0, 80)}`,
      );
      assert.ok(
        url.includes("client_id=123456789-abcdef"),
        "Auth URL should contain the client_id",
      );
      assert.ok(
        url.includes("redirect_uri="),
        "Auth URL should contain the redirect_uri",
      );
      assert.ok(
        url.includes("scope="),
        "Auth URL should contain the scope parameter",
      );
      assert.ok(
        url.includes("access_type=offline"),
        "Auth URL should request offline access",
      );
    });

    it("getValidToken fails without cached tokens", async () => {
      setGoogleConfig({
        clientId: "123456789-abcdef.apps.googleusercontent.com",
        clientSecret: "GOCSPX-test-secret",
        redirectUrl: "http://localhost:3004/oauth/callback",
        tokenCachePath: join(tmpDir, "nonexistent-tokens.json"),
      });

      await assert.rejects(
        () => getValidToken(),
        (err: Error) => {
          assert.ok(err instanceof Error);
          assert.ok(
            err.message.includes("No Google token available") ||
            err.message.includes("authenticate"),
            `Error should mention missing token/auth, got: "${err.message}"`,
          );
          return true;
        },
      );
    });
  });

  // ── Gmail ────────────────────────────────────────────────────────────

  describe("Gmail", () => {
    it("listMessages fails gracefully without auth", async () => {
      setGoogleConfig({
        clientId: "123456789-abcdef.apps.googleusercontent.com",
        clientSecret: "GOCSPX-test-secret",
        redirectUrl: "http://localhost:3004/oauth/callback",
        tokenCachePath: join(tmpDir, "no-tokens-gmail.json"),
      });

      await assert.rejects(
        () => listMessages("from:chef@firma.de", 5),
        (err: Error) => {
          assert.ok(err instanceof Error);
          assert.ok(
            err.message.length > 0,
            "Error should have a meaningful message",
          );
          return true;
        },
      );
    });

    it("sendMessage fails gracefully without auth", async () => {
      setGoogleConfig({
        clientId: "123456789-abcdef.apps.googleusercontent.com",
        clientSecret: "GOCSPX-test-secret",
        redirectUrl: "http://localhost:3004/oauth/callback",
        tokenCachePath: join(tmpDir, "no-tokens-send.json"),
      });

      await assert.rejects(
        () => sendMessage("kollege@firma.de", "Testbetreff", "Hallo, dies ist ein Test."),
        (err: Error) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.length > 0);
          return true;
        },
      );
    });
  });

  // ── Calendar ─────────────────────────────────────────────────────────

  describe("Google Calendar", () => {
    it("listEvents fails gracefully without auth", async () => {
      setGoogleConfig({
        clientId: "123456789-abcdef.apps.googleusercontent.com",
        clientSecret: "GOCSPX-test-secret",
        redirectUrl: "http://localhost:3004/oauth/callback",
        tokenCachePath: join(tmpDir, "no-tokens-cal.json"),
      });

      await assert.rejects(
        () => listEvents("primary", "2026-02-14T00:00:00Z", "2026-02-15T00:00:00Z"),
        (err: Error) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.length > 0);
          return true;
        },
      );
    });

    it("createEvent fails gracefully without auth", async () => {
      setGoogleConfig({
        clientId: "123456789-abcdef.apps.googleusercontent.com",
        clientSecret: "GOCSPX-test-secret",
        redirectUrl: "http://localhost:3004/oauth/callback",
        tokenCachePath: join(tmpDir, "no-tokens-create.json"),
      });

      await assert.rejects(
        () =>
          createEvent("primary", {
            summary: "Team-Meeting mit Hans Müller",
            start: "2026-02-15T14:00:00+01:00",
            end: "2026-02-15T15:00:00+01:00",
            description: "Besprechung zum neuen Projekt",
            location: "Büro, Musterstraße 42, Berlin",
          }),
        (err: Error) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.length > 0);
          return true;
        },
      );
    });
  });
});
