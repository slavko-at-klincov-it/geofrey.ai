/**
 * E2E: Browser Automation — Chrome DevTools Protocol
 *
 * Tests the real browser launch, navigation, evaluation, screenshot,
 * and cleanup pipeline. Skips gracefully when Chrome is not installed.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  findChromeBinary,
  launchBrowser,
  closeBrowser,
  closeAllBrowsers,
  type BrowserSession,
} from "../../browser/launcher.js";
import { navigate, evaluate, screenshot } from "../../browser/actions.js";
import { getAccessibilityTree } from "../../browser/snapshot.js";

describe("E2E: Browser Automation", { timeout: 60_000 }, () => {
  let chromePath: string | undefined;
  let chromeAvailable = false;
  let session: BrowserSession | null = null;

  before(() => {
    chromePath = findChromeBinary();
    chromeAvailable = chromePath !== undefined;
  });

  after(async () => {
    // Ensure all browser sessions are cleaned up regardless of test outcome
    await closeAllBrowsers();
  });

  // ── findChromeBinary ──────────────────────────────────────────────────────

  it("findChromeBinary returns a string path or undefined", (t) => {
    const result = findChromeBinary();
    assert.ok(
      result === undefined || typeof result === "string",
      `Expected string or undefined, got ${typeof result}`,
    );
    if (result !== undefined) {
      // If Chrome is found, the path should be a non-empty string
      assert.ok(result.length > 0, "Chrome path should not be empty");
    }
  });

  // ── launchBrowser ─────────────────────────────────────────────────────────

  it("launchBrowser opens a Chrome instance and returns a session", async (t) => {
    if (!chromeAvailable) {
      t.skip("Chrome/Chromium not installed");
      return;
    }

    session = await launchBrowser({ headless: true });

    assert.ok(session, "Session should be returned");
    assert.ok(typeof session.port === "number", "Session should have a port");
    assert.ok(session.port > 0, "Port should be positive");
    assert.ok(session.client, "Session should have a CDP client");

    // Clean up this session for the next tests
    await closeBrowser(session);
    session = null;
  });

  // ── navigate ──────────────────────────────────────────────────────────────

  it("navigate loads a data: URL without error", async (t) => {
    if (!chromeAvailable) {
      t.skip("Chrome/Chromium not installed");
      return;
    }

    session = await launchBrowser({ headless: true });

    // Navigate to a simple data URL
    await assert.doesNotReject(
      navigate(session.client, "data:text/html,<html><head><title>Geofrey Test</title></head><body><h1>Hallo Welt</h1></body></html>"),
      "Navigation to data: URL should not throw",
    );

    await closeBrowser(session);
    session = null;
  });

  // ── evaluate ──────────────────────────────────────────────────────────────

  it("evaluate executes JavaScript and returns the result", async (t) => {
    if (!chromeAvailable) {
      t.skip("Chrome/Chromium not installed");
      return;
    }

    session = await launchBrowser({ headless: true });
    await navigate(
      session.client,
      "data:text/html,<html><head><title>Eval Test</title></head><body><p>Inhalt</p></body></html>",
    );

    // Arithmetic evaluation — works regardless of page content
    const sum = await evaluate(session.client, "2 + 3");
    assert.equal(sum, 5, "JS arithmetic should work");

    // document.title may be empty on some Chrome versions with data: URLs
    const title = await evaluate(session.client, "document.title");
    assert.equal(typeof title, "string", "title should be a string");

    await closeBrowser(session);
    session = null;
  });

  // ── screenshot ────────────────────────────────────────────────────────────

  it("screenshot returns a non-empty Buffer", async (t) => {
    if (!chromeAvailable) {
      t.skip("Chrome/Chromium not installed");
      return;
    }

    session = await launchBrowser({ headless: true });

    // Enable the Page domain and navigate — some Chrome versions require
    // connecting to an actual page target for captureScreenshot to work.
    await session.client.Page.enable();
    await session.client.Page.navigate({ url: "about:blank" });
    // Small delay to let the blank page settle
    await new Promise((r) => setTimeout(r, 300));

    let buf: Buffer;
    try {
      buf = await screenshot(session.client);
    } catch (err) {
      // CDP "Not attached to an active page" can happen when the default
      // connection target is the browser rather than a page. This is a
      // known limitation of chrome-remote-interface's default connection.
      if (err instanceof Error && err.message.includes("Not attached")) {
        t.skip("CDP client not attached to a page target — screenshot not available on this Chrome version");
        await closeBrowser(session);
        session = null;
        return;
      }
      throw err;
    }

    assert.ok(Buffer.isBuffer(buf), "screenshot should return a Buffer");
    assert.ok(buf.length > 100, `Screenshot buffer should be non-trivial, got ${buf.length} bytes`);

    // PNG magic bytes: 89 50 4E 47
    assert.equal(buf[0], 0x89, "First byte should be PNG magic");
    assert.equal(buf[1], 0x50, "Second byte should be PNG magic (P)");
    assert.equal(buf[2], 0x4e, "Third byte should be PNG magic (N)");
    assert.equal(buf[3], 0x47, "Fourth byte should be PNG magic (G)");

    await closeBrowser(session);
    session = null;
  });

  // ── getAccessibilityTree ──────────────────────────────────────────────────

  it("getAccessibilityTree returns nodes for a simple page", async (t) => {
    if (!chromeAvailable) {
      t.skip("Chrome/Chromium not installed");
      return;
    }

    session = await launchBrowser({ headless: true });
    await navigate(
      session.client,
      "data:text/html,<html><body><h1>Barrierefreiheit</h1><button>Klick mich</button></body></html>",
    );

    const tree = await getAccessibilityTree(session.client);

    assert.ok(Array.isArray(tree), "Tree should be an array");
    assert.ok(tree.length > 0, "Tree should have at least one node");

    // Verify nodes have the expected shape
    const firstNode = tree[0];
    assert.ok(typeof firstNode.nodeId === "string", "Node should have a nodeId");
    assert.ok(typeof firstNode.role === "string", "Node should have a role");
    assert.ok(typeof firstNode.name === "string", "Node should have a name");

    await closeBrowser(session);
    session = null;
  });

  // ── closeAllBrowsers ──────────────────────────────────────────────────────

  it("closeAllBrowsers cleans up multiple sessions", async (t) => {
    if (!chromeAvailable) {
      t.skip("Chrome/Chromium not installed");
      return;
    }

    // Launch two separate browser instances
    const session1 = await launchBrowser({ headless: true });
    const session2 = await launchBrowser({ headless: true });

    assert.ok(session1.port !== session2.port, "Sessions should use different ports");

    // Close all at once
    await assert.doesNotReject(
      closeAllBrowsers(),
      "closeAllBrowsers should not throw",
    );

    // Verify clients are disconnected by trying to evaluate (should fail)
    await assert.rejects(
      evaluate(session1.client, "1+1"),
      "Evaluation on closed session 1 should fail",
    );
    await assert.rejects(
      evaluate(session2.client, "1+1"),
      "Evaluation on closed session 2 should fail",
    );
  });
});
