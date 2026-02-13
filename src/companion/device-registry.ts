export interface Device {
  id: string;
  name: string;
  platform: "ios" | "android" | "macos";
  pushToken?: string;
  paired: boolean;
  createdAt: Date;
}

const devices = new Map<string, Device>();

export function registerDevice(device: Device): void {
  devices.set(device.id, device);
}

export function unregisterDevice(id: string): boolean {
  return devices.delete(id);
}

export function getDevice(id: string): Device | undefined {
  return devices.get(id);
}

export function listDevices(): Device[] {
  return Array.from(devices.values());
}

export function updatePushToken(id: string, token: string): boolean {
  const device = devices.get(id);
  if (!device) return false;
  device.pushToken = token;
  return true;
}

export function clearDevices(): void {
  devices.clear();
}
