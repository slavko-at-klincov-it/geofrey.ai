import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import {
  launchBrowser,
  connectBrowser,
  closeBrowser,
  closeAllBrowsers,
  touchSession,
} from "../browser/launcher.js";
import type { BrowserSession } from "../browser/launcher.js";
import { navigate, click, fill, screenshot, evaluate, waitForSelector } from "../browser/actions.js";
import { getPageSnapshot } from "../browser/snapshot.js";
import { t } from "../i18n/index.js";

let activeSession: BrowserSession | null = null;

function requireSession(): BrowserSession {
  if (!activeSession) throw new Error(t("browser.notRunning"));
  touchSession(activeSession.port);
  return activeSession;
}

registerTool({
  name: "browser",
  description:
    "Control a web browser via Chrome DevTools Protocol. Actions: navigate, click, fill, screenshot, evaluate, snapshot, waitForSelector, launch, close.",
  parameters: z.object({
    action: z.enum([
      "launch",
      "navigate",
      "click",
      "fill",
      "screenshot",
      "evaluate",
      "snapshot",
      "waitForSelector",
      "close",
    ]),
    url: z.string().optional(),
    nodeId: z.string().optional(),
    text: z.string().optional(),
    expression: z.string().optional(),
    selector: z.string().optional(),
    timeoutMs: z.number().optional(),
    headless: z.boolean().optional(),
    profileDir: z.string().optional(),
  }),
  source: "native",
  execute: async (args) => {
    try {
      switch (args.action) {
        case "launch": {
          if (activeSession) {
            await closeBrowser(activeSession);
          }
          activeSession = await launchBrowser({
            headless: args.headless,
            profileDir: args.profileDir,
          });
          return t("browser.launched", { port: activeSession.port });
        }

        case "navigate": {
          const session = requireSession();
          if (!args.url) throw new Error(t("tools.paramRequired", { param: "url", action: "navigate" }));
          await navigate(session.client, args.url);
          return t("browser.navigated", { url: args.url });
        }

        case "click": {
          const session = requireSession();
          if (!args.nodeId) throw new Error(t("tools.paramRequired", { param: "nodeId", action: "click" }));
          await click(session.client, args.nodeId);
          return t("browser.clicked", { nodeId: args.nodeId });
        }

        case "fill": {
          const session = requireSession();
          if (!args.nodeId) throw new Error(t("tools.paramRequired", { param: "nodeId", action: "fill" }));
          if (!args.text) throw new Error(t("tools.paramRequired", { param: "text", action: "fill" }));
          await fill(session.client, args.nodeId, args.text);
          return t("browser.filled", { nodeId: args.nodeId });
        }

        case "screenshot": {
          const session = requireSession();
          const buf = await screenshot(session.client);
          return t("browser.screenshotCaptured", { size: String(buf.length) });
        }

        case "evaluate": {
          const session = requireSession();
          if (!args.expression) throw new Error(t("tools.paramRequired", { param: "expression", action: "evaluate" }));
          const result = await evaluate(session.client, args.expression);
          return JSON.stringify(result, null, 2) ?? "(undefined)";
        }

        case "snapshot": {
          const session = requireSession();
          const snap = await getPageSnapshot(session.client);
          return JSON.stringify(snap, null, 2);
        }

        case "waitForSelector": {
          const session = requireSession();
          if (!args.selector) throw new Error(t("tools.paramRequired", { param: "selector", action: "waitForSelector" }));
          await waitForSelector(session.client, args.selector, args.timeoutMs);
          return t("browser.selectorFound", { selector: args.selector });
        }

        case "close": {
          if (!activeSession) {
            return t("browser.notRunning");
          }
          await closeBrowser(activeSession);
          activeSession = null;
          return t("browser.closed");
        }

        default:
          return t("tools.unknownAction", { action: args.action as string });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Re-throw "not running" errors directly
      if (msg === t("browser.notRunning")) throw err;
      throw new Error(t("browser.actionFailed", { msg }));
    }
  },
});

// For graceful shutdown integration
export { closeAllBrowsers } from "../browser/launcher.js";
