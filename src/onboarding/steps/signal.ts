import { existsSync } from "node:fs";
import { platform } from "node:os";
import { stepHeader, success, fail, info, spinner } from "../utils/ui.js";
import { askText, askYesNo } from "../utils/prompt.js";
import { t } from "../../i18n/index.js";

export interface SignalConfig {
  signalCliSocket: string;
  ownerPhone: string;
  botPhone: string;
}

const DEFAULT_SOCKET = platform() === "win32"
  ? "\\\\.\\pipe\\signal-cli"
  : "/var/run/signal-cli/socket";

export async function setupSignal(): Promise<SignalConfig | null> {
  stepHeader(2, t("onboarding.signalTitle"));

  const isWindows = platform() === "win32";
  let prereqText = t("onboarding.signalPrereqs");
  if (isWindows) {
    prereqText = prereqText.replace(
      "→ Docs:",
      `(Windows: signal-cli --output=json jsonRpc --socket \\\\.\\pipe\\signal-cli)\n  → Docs:`,
    );
  }
  console.log(prereqText);

  // Socket path
  let signalCliSocket = DEFAULT_SOCKET;
  if (existsSync(DEFAULT_SOCKET)) {
    success(t("onboarding.signalSocketFound", { path: DEFAULT_SOCKET }));
  } else {
    info(t("onboarding.signalSocketNotFound", { path: DEFAULT_SOCKET }));
    signalCliSocket = await askText(t("onboarding.signalSocketPrompt"), DEFAULT_SOCKET);
  }

  // Validate socket
  const spin = spinner(t("onboarding.connectionCheck"));
  try {
    const net = await import("node:net");
    const connected = await new Promise<boolean>((resolve) => {
      const client = net.createConnection(signalCliSocket, () => {
        client.write(JSON.stringify({ jsonrpc: "2.0", method: "version", id: 1 }) + "\n");
      });
      client.on("data", () => { client.destroy(); resolve(true); });
      client.on("error", () => resolve(false));
      setTimeout(() => { client.destroy(); resolve(false); }, 5000);
    });

    if (connected) {
      spin.succeed(t("onboarding.signalConnected"));
    } else {
      spin.fail(t("onboarding.signalConnectionFailed"));
      const cont = await askYesNo(t("onboarding.continueAnyway"), false);
      if (!cont) return null;
    }
  } catch {
    spin.fail(t("onboarding.signalConnectionFailed"));
    const cont = await askYesNo(t("onboarding.continueAnyway"), false);
    if (!cont) return null;
  }

  const ownerPhone = await askText(t("onboarding.signalOwnerPhone"));
  if (!ownerPhone.trim()) { fail(t("onboarding.phoneMissing")); return null; }

  const botPhone = await askText(t("onboarding.signalBotPhone"));
  if (!botPhone.trim()) { fail(t("onboarding.signalBotPhoneMissing")); return null; }

  return { signalCliSocket, ownerPhone, botPhone };
}
