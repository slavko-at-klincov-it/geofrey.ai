import { connect, constants } from "node:http2";
import { readFileSync } from "node:fs";
import type { Device } from "./device-registry.js";

export interface PushConfig {
  apnsKeyPath?: string;
  apnsKeyId?: string;
  apnsTeamId?: string;
  apnsBundleId?: string;
  fcmServerKey?: string;
}

let pushConfig: PushConfig | null = null;

export function setPushConfig(config: PushConfig): void {
  pushConfig = config;
}

export function getPushConfig(): PushConfig | null {
  return pushConfig;
}

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

const APNS_HOST = "https://api.push.apple.com";
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Send push notification via APNs (Apple Push Notification service).
 */
export async function sendApns(deviceToken: string, payload: PushNotification): Promise<boolean> {
  if (!pushConfig?.apnsKeyPath || !pushConfig?.apnsKeyId || !pushConfig?.apnsTeamId || !pushConfig?.apnsBundleId) {
    throw new Error("APNS not configured — set apnsKeyPath, apnsKeyId, apnsTeamId, apnsBundleId");
  }

  const key = readFileSync(pushConfig.apnsKeyPath, "utf-8");

  return new Promise<boolean>((resolve, reject) => {
    const client = connect(APNS_HOST);
    const headers = {
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "apns-topic": pushConfig!.apnsBundleId!,
      "apns-push-type": "alert",
      authorization: `bearer ${key.trim()}`, // Simplified: real implementation needs JWT
    };

    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: "default",
      },
      ...payload.data,
    });

    const req = client.request(headers);
    req.setEncoding("utf-8");
    let data = "";

    req.on("response", (headers) => {
      const status = headers[":status"];
      if (status === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => client.close());
    req.on("error", (err) => {
      client.close();
      reject(err);
    });

    req.end(body);

    setTimeout(() => {
      client.close();
      reject(new Error("APNS request timeout"));
    }, FETCH_TIMEOUT_MS);
  });
}

/**
 * Send push notification via FCM (Firebase Cloud Messaging).
 */
export async function sendFcm(deviceToken: string, payload: PushNotification): Promise<boolean> {
  if (!pushConfig?.fcmServerKey) {
    throw new Error("FCM not configured — set fcmServerKey");
  }

  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `key=${pushConfig.fcmServerKey}`,
    },
    body: JSON.stringify({
      to: deviceToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  return res.ok;
}

/**
 * Route push notification to the correct provider based on device platform.
 */
export async function sendPush(device: Device, notification: PushNotification): Promise<boolean> {
  if (!device.pushToken) {
    throw new Error(`Device ${device.id} has no push token`);
  }

  switch (device.platform) {
    case "ios":
    case "macos":
      return sendApns(device.pushToken, notification);
    case "android":
      return sendFcm(device.pushToken, notification);
    default:
      throw new Error(`Unknown platform: ${device.platform}`);
  }
}
