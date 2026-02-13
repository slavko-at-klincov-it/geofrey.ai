import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import {
  registerDevice,
  unregisterDevice,
  listDevices,
  getDevice,
  type Device,
} from "../companion/device-registry.js";
import { createPairing } from "../companion/pairing.js";
import { sendPush } from "../companion/push.js";
import { t } from "../i18n/index.js";
import { randomUUID } from "node:crypto";

registerTool({
  name: "companion",
  description: "Manage companion app devices: pair, unpair, list, or send push notifications.",
  parameters: z.object({
    action: z.enum(["pair", "unpair", "list", "push_notification"]),
    deviceName: z.string().optional().describe("Device name (required for pair)"),
    platform: z.enum(["ios", "android", "macos"]).optional().describe("Device platform (required for pair)"),
    code: z.string().optional().describe("Pairing code to verify"),
    deviceId: z.string().optional().describe("Device ID (required for unpair, push_notification)"),
    title: z.string().optional().describe("Notification title (required for push_notification)"),
    body: z.string().optional().describe("Notification body (required for push_notification)"),
  }),
  source: "native",
  execute: async ({ action, deviceName, platform, code, deviceId, title, body }) => {
    switch (action) {
      case "pair": {
        if (!deviceName) return t("tools.paramRequired", { param: "deviceName", action: "pair" });
        if (!platform) return t("tools.paramRequired", { param: "platform", action: "pair" });

        const id = randomUUID();
        const device: Device = {
          id,
          name: deviceName,
          platform,
          paired: true,
          createdAt: new Date(),
        };
        registerDevice(device);
        const pairingCode = createPairing(id);
        return t("companion.pairingCode", { code: pairingCode, ttl: "300" });
      }

      case "unpair": {
        if (!deviceId) return t("tools.paramRequired", { param: "deviceId", action: "unpair" });
        const success = unregisterDevice(deviceId);
        if (!success) return t("companion.notFound", { id: deviceId });
        return t("companion.unpaired", { id: deviceId });
      }

      case "list": {
        const devices = listDevices();
        if (devices.length === 0) return t("companion.listEmpty");
        const header = t("companion.listHeader", { count: String(devices.length) });
        const entries = devices.map(
          (d) => `- ${d.name} (${d.platform}) id=${d.id} paired=${d.paired}`,
        );
        return `${header}\n${entries.join("\n")}`;
      }

      case "push_notification": {
        if (!deviceId) return t("tools.paramRequired", { param: "deviceId", action: "push_notification" });
        if (!title) return t("tools.paramRequired", { param: "title", action: "push_notification" });
        if (!body) return t("tools.paramRequired", { param: "body", action: "push_notification" });

        const device = getDevice(deviceId);
        if (!device) return t("companion.notFound", { id: deviceId });

        try {
          await sendPush(device, { title, body });
          return t("companion.pushSent", { deviceName: device.name });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Push notification failed: ${msg}`;
        }
      }

      default:
        return t("tools.unknownAction", { action: String(action) });
    }
  },
});
