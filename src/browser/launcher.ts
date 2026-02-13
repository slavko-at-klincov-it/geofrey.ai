import CDP from "chrome-remote-interface";
import { execa, type ResultPromise } from "execa";
import { platform } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { existsSync } from "node:fs";

const BROWSER_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface BrowserSession {
  client: CDP.Client;
  process?: ReturnType<typeof execa>;
  port: number;
  profileDir?: string;
  idleTimer?: ReturnType<typeof setTimeout>;
}

export interface LaunchOptions {
  headless?: boolean;
  port?: number;
  profileDir?: string;
  args?: string[];
}

const sessions: Map<number, BrowserSession> = new Map();

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
    "C:\\Program Files\\Chromium\\Application\\chrome.exe",
  ],
};

export function findChromeBinary(): string | undefined {
  const os = platform();
  const candidates = CHROME_PATHS[os] ?? [];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return undefined;
}

export async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not determine port")));
      }
    });
    server.on("error", reject);
  });
}

async function waitForDebugPort(port: number, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await CDP.Version({ port });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Chrome debug port ${port} not ready after ${timeoutMs}ms`);
}

export async function launchBrowser(options?: LaunchOptions): Promise<BrowserSession> {
  const chromeBinary = findChromeBinary();
  if (!chromeBinary) {
    throw new Error("Chrome/Chromium not found. Install Chrome or set a custom binary path.");
  }

  const port = options?.port ?? await findAvailablePort();
  const headless = options?.headless ?? true;
  const profileDir = options?.profileDir ?? await mkdtemp(join(tmpdir(), "geofrey-chrome-"));

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
  ];

  if (headless) {
    args.push("--headless=new");
  }

  if (options?.args) {
    args.push(...options.args);
  }

  const proc = execa(chromeBinary, args, {
    reject: false,
    detached: platform() !== "win32",
    stdio: "ignore",
  });

  await waitForDebugPort(port);

  const client = await CDP({ port });

  const session: BrowserSession = {
    client,
    process: proc,
    port,
    profileDir: options?.profileDir ? undefined : profileDir,
  };

  // Auto-close after idle timeout
  session.idleTimer = setTimeout(() => {
    void closeBrowser(session);
  }, BROWSER_IDLE_TIMEOUT_MS);
  if (session.idleTimer.unref) session.idleTimer.unref();

  sessions.set(port, session);
  return session;
}

export async function connectBrowser(port = 9222): Promise<BrowserSession> {
  const client = await CDP({ port });

  const session: BrowserSession = {
    client,
    port,
  };

  sessions.set(port, session);
  return session;
}

/** Resets the idle timer for a session (called by browser actions). */
export function touchSession(port: number): void {
  const session = sessions.get(port);
  if (session?.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      void closeBrowser(session);
    }, BROWSER_IDLE_TIMEOUT_MS);
    if (session.idleTimer.unref) session.idleTimer.unref();
  }
}

export async function closeBrowser(session: BrowserSession): Promise<void> {
  sessions.delete(session.port);

  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
  }

  try {
    await session.client.close();
  } catch {
    // Client may already be disconnected
  }

  if (session.process) {
    try {
      session.process.kill("SIGTERM");
    } catch {
      // Process may already be dead
    }
  }

  // Clean up temporary profile directory
  if (session.profileDir) {
    try {
      await rm(session.profileDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

export async function closeAllBrowsers(): Promise<void> {
  const all = Array.from(sessions.values());
  await Promise.allSettled(all.map((s) => closeBrowser(s)));
}

export function getActiveSessions(): Map<number, BrowserSession> {
  return sessions;
}
