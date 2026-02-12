import { existsSync } from "node:fs";
import { platform } from "node:os";
import { stepHeader, success, fail, info, spinner } from "../utils/ui.js";
import { askText, askYesNo } from "../utils/prompt.js";

export interface SignalConfig {
  signalCliSocket: string;
  ownerPhone: string;
  botPhone: string;
}

const DEFAULT_SOCKET = platform() === "win32"
  ? "\\\\.\\pipe\\signal-cli"
  : "/var/run/signal-cli/socket";

export async function setupSignal(): Promise<SignalConfig | null> {
  stepHeader(2, "Signal einrichten");

  const isWindows = platform() === "win32";
  console.log(`
  Voraussetzungen:
  1. signal-cli installiert und registriert
  2. signal-cli im JSON-RPC Modus gestartet${isWindows ? "\n     (Windows: signal-cli --output=json jsonRpc --socket \\\\.\\pipe\\signal-cli)" : ""}
  → Docs: https://github.com/AsamK/signal-cli
`);

  // Socket path
  let signalCliSocket = DEFAULT_SOCKET;
  if (existsSync(DEFAULT_SOCKET)) {
    success(`signal-cli Socket gefunden: ${DEFAULT_SOCKET}`);
  } else {
    info(`Standard-Socket nicht gefunden: ${DEFAULT_SOCKET}`);
    signalCliSocket = await askText("Pfad zum signal-cli Socket:", DEFAULT_SOCKET);
  }

  // Validate socket
  const spin = spinner("Verbindung wird geprüft...");
  try {
    const net = await import("node:net");
    const connected = await new Promise<boolean>((resolve) => {
      const client = net.createConnection(signalCliSocket, () => {
        // Send JSON-RPC version request
        client.write(JSON.stringify({ jsonrpc: "2.0", method: "version", id: 1 }) + "\n");
      });
      client.on("data", () => { client.destroy(); resolve(true); });
      client.on("error", () => resolve(false));
      setTimeout(() => { client.destroy(); resolve(false); }, 5000);
    });

    if (connected) {
      spin.succeed("signal-cli verbunden");
    } else {
      spin.fail("Verbindung fehlgeschlagen");
      const cont = await askYesNo("Trotzdem fortfahren?", false);
      if (!cont) return null;
    }
  } catch {
    spin.fail("Verbindung fehlgeschlagen");
    const cont = await askYesNo("Trotzdem fortfahren?", false);
    if (!cont) return null;
  }

  const ownerPhone = await askText("Deine Telefonnummer (z.B. +491234567890):");
  if (!ownerPhone.trim()) { fail("Telefonnummer fehlt"); return null; }

  const botPhone = await askText("Bot-Telefonnummer (registriert bei signal-cli):");
  if (!botPhone.trim()) { fail("Bot-Nummer fehlt"); return null; }

  return { signalCliSocket, ownerPhone, botPhone };
}
