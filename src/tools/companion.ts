import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import {
  createPairingCode,
  pendingPairingCount,
  shutdownPairing,
} from "../companion/pairing.js";
import {
  listDevices,
  getDevice,
  removeDevice,
  updatePushToken,
} from "../companion/device-registry.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDevice(d: ReturnType<typeof getDevice>): string {
  if (!d) return "Device not found";
  const onlineStr = d.online ? "online" : "offline";
  const pushStr = d.pushToken ? "push=yes" : "push=no";
  const lastSeen = d.lastSeenAt.toISOString();
  const pairedAt = d.pairedAt.toISOString();
  return `[${d.deviceId}] "${d.name}" platform=${d.platform} ${onlineStr} ${pushStr} chatId=${d.chatId} paired=${pairedAt} lastSeen=${lastSeen}`;
}

// ── Tool Registration ──────────────────────────────────────────────────────

registerTool({
  name: "companion",
  description:
    "Manage companion app devices: pair new devices, unpair existing ones, list paired devices, or update push tokens. Use 'pair' to generate a 6-digit pairing code for the companion app.",
  parameters: z.object({
    action: z.enum(["pair", "unpair", "list", "push_token"]),
    chatId: z.string().optional().describe("Chat ID of the requesting user (required for pair)"),
    deviceId: z.string().optional().describe("Device ID (required for unpair/push_token)"),
    pushToken: z.string().optional().describe("New push token (required for push_token)"),
  }),
  source: "native",
  execute: async ({ action, chatId, deviceId, pushToken }) => {
    switch (action) {
      case "pair": {
        if (!chatId) return "Error: 'chatId' is required for pair";

        const code = createPairingCode(chatId);
        return [
          `Pairing code: ${code}`,
          "",
          "Enter this code in the companion app within 5 minutes.",
          `Currently ${pendingPairingCount()} pending pairing code(s).`,
        ].join("\n");
      }

      case "unpair": {
        if (!deviceId) return "Error: 'deviceId' is required for unpair";

        const device = getDevice(deviceId);
        if (!device) return "Device not found";

        const removed = removeDevice(deviceId);
        if (!removed) return "Failed to remove device";

        return `Device unpaired: ${device.name} (${deviceId})`;
      }

      case "list": {
        const all = listDevices();
        if (all.length === 0) return "No companion devices paired";

        const onlineCount = all.filter((d) => d.online).length;
        const header = `${all.length} companion device(s), ${onlineCount} online:`;
        const lines = all.map(formatDevice);
        return `${header}\n${lines.join("\n")}`;
      }

      case "push_token": {
        if (!deviceId) return "Error: 'deviceId' is required for push_token";
        if (!pushToken) return "Error: 'pushToken' is required for push_token";

        const device = getDevice(deviceId);
        if (!device) return "Device not found";

        const updated = updatePushToken(deviceId, pushToken);
        if (!updated) return "Failed to update push token";

        return `Push token updated for ${device.name} (${deviceId})`;
      }
    }
  },
});

// Re-export for graceful shutdown integration
export { shutdownPairing } from "../companion/pairing.js";
