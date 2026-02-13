import { connect, type ClientHttp2Session } from "node:http2";
import type { Device } from "./device-registry.js";

// ── Constants ──────────────────────────────────────────────────────────────

const APNS_HOST_PRODUCTION = "https://api.push.apple.com";
const APNS_HOST_SANDBOX = "https://api.sandbox.push.apple.com";
const FCM_V1_URL = "https://fcm.googleapis.com/v1/projects";
const APNS_CONNECT_TIMEOUT_MS = 10_000;
const FCM_FETCH_TIMEOUT_MS = 10_000;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string; // PEM-encoded P8 key
  sandbox?: boolean;
}

export interface FcmConfig {
  projectId: string;
  serviceAccountKey: string; // JSON string of service account
}

export interface PushConfig {
  apns?: ApnsConfig;
  fcm?: FcmConfig;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  success: boolean;
  deviceId: string;
  provider: "apns" | "fcm";
  error?: string;
}

// ── APNS JWT ───────────────────────────────────────────────────────────────

let cachedApnsJwt: { token: string; expiresAt: number } | null = null;

async function getApnsJwt(config: ApnsConfig): Promise<string> {
  // JWT valid for ~55 minutes (Apple requires refresh within 60 min)
  const now = Math.floor(Date.now() / 1_000);
  if (cachedApnsJwt && cachedApnsJwt.expiresAt > now) {
    return cachedApnsJwt.token;
  }

  // Build JWT header + payload manually (ES256)
  const header = Buffer.from(JSON.stringify({
    alg: "ES256",
    kid: config.keyId,
  })).toString("base64url");

  const payload = Buffer.from(JSON.stringify({
    iss: config.teamId,
    iat: now,
  })).toString("base64url");

  const { createSign } = await import("node:crypto");
  const sign = createSign("SHA256");
  sign.update(`${header}.${payload}`);

  // Convert P8 key to DER signature
  const signature = sign.sign({
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  }, "base64url");

  const token = `${header}.${payload}.${signature}`;
  cachedApnsJwt = { token, expiresAt: now + 55 * 60 };

  return token;
}

// ── APNS Push ──────────────────────────────────────────────────────────────

async function sendApnsPush(
  config: ApnsConfig,
  pushToken: string,
  payload: PushPayload,
): Promise<PushResult> {
  const host = config.sandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;

  let session: ClientHttp2Session | null = null;

  try {
    const jwt = await getApnsJwt(config);

    session = connect(host);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("APNS connect timeout")), APNS_CONNECT_TIMEOUT_MS);
      session!.on("connect", () => { clearTimeout(timer); resolve(); });
      session!.on("error", (err) => { clearTimeout(timer); reject(err); });
    });

    const apnsPayload = JSON.stringify({
      aps: {
        alert: {
          title: payload.title,
          body: payload.body,
        },
        sound: "default",
        "mutable-content": 1,
      },
      ...payload.data,
    });

    const result = await new Promise<PushResult>((resolve) => {
      const req = session!.request({
        ":method": "POST",
        ":path": `/3/device/${pushToken}`,
        "authorization": `bearer ${jwt}`,
        "apns-topic": config.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(apnsPayload),
      });

      let responseData = "";
      let statusCode = 0;

      req.on("response", (headers) => {
        statusCode = Number(headers[":status"]);
      });

      req.on("data", (chunk: Buffer) => {
        responseData += chunk.toString();
      });

      req.on("end", () => {
        if (statusCode === 200) {
          resolve({ success: true, deviceId: "", provider: "apns" });
        } else {
          let errorMsg = `APNS status ${statusCode}`;
          try {
            const parsed = JSON.parse(responseData) as { reason?: string };
            if (parsed.reason) errorMsg = `APNS: ${parsed.reason}`;
          } catch {
            // Use status code message
          }
          resolve({ success: false, deviceId: "", provider: "apns", error: errorMsg });
        }
      });

      req.on("error", (err) => {
        resolve({ success: false, deviceId: "", provider: "apns", error: err.message });
      });

      req.end(apnsPayload);
    });

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, deviceId: "", provider: "apns", error: msg };
  } finally {
    if (session) {
      session.close();
    }
  }
}

// ── FCM OAuth2 ─────────────────────────────────────────────────────────────

let cachedFcmToken: { token: string; expiresAt: number } | null = null;

async function getFcmAccessToken(config: FcmConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  if (cachedFcmToken && cachedFcmToken.expiresAt > now) {
    return cachedFcmToken.token;
  }

  const serviceAccount = JSON.parse(config.serviceAccountKey) as {
    client_email: string;
    private_key: string;
    token_uri: string;
  };

  // Create JWT for Google OAuth2
  const header = Buffer.from(JSON.stringify({
    alg: "RS256",
    typ: "JWT",
  })).toString("base64url");

  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3_600,
  })).toString("base64url");

  const { createSign } = await import("node:crypto");
  const sign = createSign("SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(serviceAccount.private_key, "base64url");

  const jwt = `${header}.${payload}.${signature}`;

  // Exchange JWT for access token
  const response = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    signal: AbortSignal.timeout(FCM_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`FCM OAuth2 failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedFcmToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in - 60, // Refresh 60s early
  };

  return data.access_token;
}

// ── FCM Push ───────────────────────────────────────────────────────────────

async function sendFcmPush(
  config: FcmConfig,
  pushToken: string,
  payload: PushPayload,
): Promise<PushResult> {
  try {
    const accessToken = await getFcmAccessToken(config);
    const url = `${FCM_V1_URL}/${config.projectId}/messages:send`;

    const fcmPayload = {
      message: {
        token: pushToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data ?? {},
        android: {
          priority: "high" as const,
          notification: {
            sound: "default",
            click_action: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fcmPayload),
      signal: AbortSignal.timeout(FCM_FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      return { success: true, deviceId: "", provider: "fcm" };
    }

    const errorBody = await response.text();
    let errorMsg = `FCM status ${response.status}`;
    try {
      const parsed = JSON.parse(errorBody) as { error?: { message?: string } };
      if (parsed.error?.message) errorMsg = `FCM: ${parsed.error.message}`;
    } catch {
      // Use status code
    }

    return { success: false, deviceId: "", provider: "fcm", error: errorMsg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, deviceId: "", provider: "fcm", error: msg };
  }
}

// ── Unified Push API ───────────────────────────────────────────────────────

export function createPushDispatcher(config: PushConfig) {
  /**
   * Send push notification to a specific device.
   */
  async function sendPush(
    device: Device,
    payload: PushPayload,
  ): Promise<PushResult> {
    if (!device.pushToken) {
      return {
        success: false,
        deviceId: device.deviceId,
        provider: device.pushProvider ?? "apns",
        error: "No push token configured",
      };
    }

    if (device.pushProvider === "apns") {
      if (!config.apns) {
        return {
          success: false,
          deviceId: device.deviceId,
          provider: "apns",
          error: "APNS not configured",
        };
      }
      const result = await sendApnsPush(config.apns, device.pushToken, payload);
      return { ...result, deviceId: device.deviceId };
    }

    if (device.pushProvider === "fcm") {
      if (!config.fcm) {
        return {
          success: false,
          deviceId: device.deviceId,
          provider: "fcm",
          error: "FCM not configured",
        };
      }
      const result = await sendFcmPush(config.fcm, device.pushToken, payload);
      return { ...result, deviceId: device.deviceId };
    }

    return {
      success: false,
      deviceId: device.deviceId,
      provider: "apns",
      error: `Unknown push provider: ${device.pushProvider}`,
    };
  }

  /**
   * Send push notification to all offline devices with push tokens.
   */
  async function sendPushToOffline(
    offlineDevices: Device[],
    payload: PushPayload,
  ): Promise<PushResult[]> {
    const eligible = offlineDevices.filter((d) => d.pushToken);
    if (eligible.length === 0) return [];

    const results = await Promise.allSettled(
      eligible.map((device) => sendPush(device, payload)),
    );

    return results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        success: false,
        deviceId: eligible[i].deviceId,
        provider: eligible[i].pushProvider ?? ("apns" as const),
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });
  }

  /**
   * Check if push is configured for at least one provider.
   */
  function isConfigured(): boolean {
    return !!(config.apns || config.fcm);
  }

  return {
    sendPush,
    sendPushToOffline,
    isConfigured,
  };
}

export type PushDispatcher = ReturnType<typeof createPushDispatcher>;

/** Reset cached tokens (for testing) */
export function _testResetTokenCaches(): void {
  cachedApnsJwt = null;
  cachedFcmToken = null;
}
