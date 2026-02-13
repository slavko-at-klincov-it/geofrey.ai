import { z } from "zod";
import { randomBytes } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export type DevicePlatform = "ios" | "macos" | "android";

export const deviceSchema = z.object({
  deviceId: z.string().min(1),
  name: z.string().min(1),
  platform: z.enum(["ios", "macos", "android"]),
  pushToken: z.string().optional(),
  pushProvider: z.enum(["apns", "fcm"]).optional(),
  chatId: z.string().min(1),
  pairedAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  online: z.boolean().default(false),
});

export type Device = z.infer<typeof deviceSchema>;

export interface DeviceCreateInput {
  name: string;
  platform: DevicePlatform;
  pushToken?: string;
}

// ── Internal state ─────────────────────────────────────────────────────────

const devices = new Map<string, Device>();

// ── Helpers ────────────────────────────────────────────────────────────────

function generateDeviceId(): string {
  return randomBytes(12).toString("hex");
}

function buildChatId(deviceId: string): string {
  return `companion:${deviceId}`;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function registerDevice(input: DeviceCreateInput): Device {
  const deviceId = generateDeviceId();
  const now = new Date();

  const pushProvider = input.platform === "android" ? "fcm" as const
    : (input.platform === "ios" || input.platform === "macos") ? "apns" as const
    : undefined;

  const device: Device = {
    deviceId,
    name: input.name,
    platform: input.platform,
    pushToken: input.pushToken,
    pushProvider,
    chatId: buildChatId(deviceId),
    pairedAt: now,
    lastSeenAt: now,
    online: true,
  };

  devices.set(deviceId, device);
  return { ...device };
}

export function getDevice(deviceId: string): Device | undefined {
  const device = devices.get(deviceId);
  return device ? { ...device } : undefined;
}

export function getDeviceByChatId(chatId: string): Device | undefined {
  for (const device of devices.values()) {
    if (device.chatId === chatId) {
      return { ...device };
    }
  }
  return undefined;
}

export function listDevices(): Device[] {
  return Array.from(devices.values()).map((d) => ({ ...d }));
}

export function removeDevice(deviceId: string): boolean {
  return devices.delete(deviceId);
}

export function updateLastSeen(deviceId: string, online: boolean): boolean {
  const device = devices.get(deviceId);
  if (!device) return false;
  device.lastSeenAt = new Date();
  device.online = online;
  return true;
}

export function updatePushToken(deviceId: string, pushToken: string): boolean {
  const device = devices.get(deviceId);
  if (!device) return false;
  device.pushToken = pushToken;
  return true;
}

export function setDeviceOnline(deviceId: string, online: boolean): boolean {
  const device = devices.get(deviceId);
  if (!device) return false;
  device.online = online;
  if (online) {
    device.lastSeenAt = new Date();
  }
  return true;
}

export function getOfflineDevicesWithPush(): Device[] {
  return Array.from(devices.values())
    .filter((d) => !d.online && d.pushToken)
    .map((d) => ({ ...d }));
}

/** Clear all devices (for testing) */
export function _testClearAll(): void {
  devices.clear();
}
