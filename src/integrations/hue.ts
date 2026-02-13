/**
 * Philips Hue API v2 client.
 * Uses native fetch — no SDK dependency.
 * Communicates with the bridge via CLIP API v2 (HTTPS).
 */

import { z } from "zod";

export interface HueConfig {
  bridgeIp: string;
  username: string;
}

export interface HueLight {
  id: string;
  name: string;
  on: boolean;
  brightness: number | null;
  colorTemperature: number | null;
  colorXy: { x: number; y: number } | null;
  reachable: boolean;
}

export interface HueScene {
  id: string;
  name: string;
  group: string | null;
}

export interface HueRoom {
  id: string;
  name: string;
  lightIds: string[];
}

export interface HueAuthResult {
  username: string;
  clientkey: string;
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Zod schemas for Hue API v2 response validation.
 */
const hueErrorSchema = z.object({
  errors: z.array(z.object({
    description: z.string(),
  })).optional(),
});

const hueLightResourceSchema = z.object({
  id: z.string(),
  metadata: z.object({
    name: z.string(),
  }).optional(),
  on: z.object({ on: z.boolean() }).optional(),
  dimming: z.object({ brightness: z.number() }).optional(),
  color_temperature: z.object({ mirek: z.number().nullable() }).optional(),
  color: z.object({
    xy: z.object({ x: z.number(), y: z.number() }),
  }).optional(),
  status: z.enum(["connected", "connectivity_issue"]).optional(),
});

const hueSceneResourceSchema = z.object({
  id: z.string(),
  metadata: z.object({ name: z.string() }).optional(),
  group: z.object({
    rid: z.string(),
  }).optional(),
});

const hueRoomResourceSchema = z.object({
  id: z.string(),
  metadata: z.object({ name: z.string() }).optional(),
  children: z.array(z.object({
    rid: z.string(),
    rtype: z.string(),
  })).optional(),
});

/**
 * Build the base URL for CLIP API v2.
 * The Hue bridge uses HTTPS with a self-signed certificate.
 */
function baseUrl(config: HueConfig): string {
  return `https://${config.bridgeIp}`;
}

/**
 * Build headers for authenticated requests.
 */
function authHeaders(config: HueConfig): Record<string, string> {
  return {
    "hue-application-key": config.username,
    "Content-Type": "application/json",
  };
}

/**
 * Make an authenticated request to the Hue bridge.
 * Note: Hue bridge uses self-signed certs. In production, Node.js
 * may need NODE_TLS_REJECT_UNAUTHORIZED=0 or a custom agent.
 */
async function hueRequest(
  config: HueConfig,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const url = `${baseUrl(config)}${path}`;
  const options: RequestInit = {
    method,
    headers: authHeaders(config),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hue API ${res.status}: ${text}`);
  }

  const data = await res.json();

  // Check for Hue-specific error format
  const parsed = hueErrorSchema.safeParse(data);
  if (parsed.success && parsed.data.errors && parsed.data.errors.length > 0) {
    throw new Error(`Hue error: ${parsed.data.errors[0].description}`);
  }

  return data;
}

/**
 * Attempt to register with the Hue bridge.
 * The user must press the bridge button within 30 seconds before calling this.
 *
 * @param bridgeIp - IP address of the Hue bridge
 * @param deviceType - Application identifier (e.g., "geofrey#instance")
 * @returns Authentication credentials or error message
 */
export async function authenticate(bridgeIp: string, deviceType: string): Promise<HueAuthResult | string> {
  try {
    const res = await fetch(`https://${bridgeIp}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        devicetype: deviceType,
        generateclientkey: true,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return `Hue bridge returned ${res.status}`;
    }

    const data = await res.json() as Array<{
      success?: { username?: string; clientkey?: string };
      error?: { type?: number; description?: string };
    }>;

    if (!Array.isArray(data) || data.length === 0) {
      return "Unexpected response from Hue bridge";
    }

    const entry = data[0];
    if (entry.error) {
      if (entry.error.type === 101) {
        return "Press the button on the Hue bridge and try again within 30 seconds";
      }
      return `Hue error: ${entry.error.description ?? "unknown"}`;
    }

    if (entry.success?.username) {
      return {
        username: entry.success.username,
        clientkey: entry.success.clientkey ?? "",
      };
    }

    return "Unexpected response format from Hue bridge";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed to connect to Hue bridge: ${msg}`;
  }
}

/**
 * Check if the bridge is reachable and the username is valid.
 */
export async function checkConnection(config: HueConfig): Promise<boolean> {
  try {
    await hueRequest(config, "GET", "/clip/v2/resource/bridge");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all lights from the bridge.
 */
export async function getLights(config: HueConfig): Promise<HueLight[]> {
  const data = await hueRequest(config, "GET", "/clip/v2/resource/light") as {
    data?: unknown[];
  };

  if (!data.data || !Array.isArray(data.data)) return [];

  const lights: HueLight[] = [];
  for (const raw of data.data) {
    const parsed = hueLightResourceSchema.safeParse(raw);
    if (!parsed.success) continue;

    const light = parsed.data;
    lights.push({
      id: light.id,
      name: light.metadata?.name ?? "Unknown Light",
      on: light.on?.on ?? false,
      brightness: light.dimming?.brightness ?? null,
      colorTemperature: light.color_temperature?.mirek ?? null,
      colorXy: light.color?.xy ? { x: light.color.xy.x, y: light.color.xy.y } : null,
      reachable: light.status !== "connectivity_issue",
    });
  }

  return lights;
}

/**
 * Control a light: on/off, brightness, color temperature, or color xy.
 */
export async function controlLight(
  config: HueConfig,
  lightId: string,
  params: {
    on?: boolean;
    brightness?: number;
    colorTemperatureMirek?: number;
    colorXy?: { x: number; y: number };
  },
): Promise<string> {
  const body: Record<string, unknown> = {};

  if (params.on !== undefined) {
    body.on = { on: params.on };
  }
  if (params.brightness !== undefined) {
    body.dimming = { brightness: Math.max(0, Math.min(100, params.brightness)) };
  }
  if (params.colorTemperatureMirek !== undefined) {
    body.color_temperature = { mirek: Math.max(153, Math.min(500, params.colorTemperatureMirek)) };
  }
  if (params.colorXy !== undefined) {
    body.color = { xy: { x: params.colorXy.x, y: params.colorXy.y } };
  }

  await hueRequest(config, "PUT", `/clip/v2/resource/light/${lightId}`, body);
  return `Light ${lightId} updated`;
}

/**
 * Get all scenes from the bridge.
 */
export async function getScenes(config: HueConfig): Promise<HueScene[]> {
  const data = await hueRequest(config, "GET", "/clip/v2/resource/scene") as {
    data?: unknown[];
  };

  if (!data.data || !Array.isArray(data.data)) return [];

  const scenes: HueScene[] = [];
  for (const raw of data.data) {
    const parsed = hueSceneResourceSchema.safeParse(raw);
    if (!parsed.success) continue;

    const scene = parsed.data;
    scenes.push({
      id: scene.id,
      name: scene.metadata?.name ?? "Unknown Scene",
      group: scene.group?.rid ?? null,
    });
  }

  return scenes;
}

/**
 * Recall (activate) a scene by ID.
 */
export async function recallScene(config: HueConfig, sceneId: string): Promise<string> {
  await hueRequest(config, "PUT", `/clip/v2/resource/scene/${sceneId}`, {
    recall: { action: "active" },
  });
  return `Scene ${sceneId} activated`;
}

/**
 * Get all rooms from the bridge.
 */
export async function getRooms(config: HueConfig): Promise<HueRoom[]> {
  const data = await hueRequest(config, "GET", "/clip/v2/resource/room") as {
    data?: unknown[];
  };

  if (!data.data || !Array.isArray(data.data)) return [];

  const rooms: HueRoom[] = [];
  for (const raw of data.data) {
    const parsed = hueRoomResourceSchema.safeParse(raw);
    if (!parsed.success) continue;

    const room = parsed.data;
    rooms.push({
      id: room.id,
      name: room.metadata?.name ?? "Unknown Room",
      lightIds: (room.children ?? [])
        .filter((c) => c.rtype === "light")
        .map((c) => c.rid),
    });
  }

  return rooms;
}

/**
 * Format a light for display.
 */
export function formatLight(light: HueLight): string {
  const state = light.on ? "ON" : "OFF";
  const brightness = light.brightness !== null ? ` brightness=${light.brightness}%` : "";
  const temp = light.colorTemperature !== null ? ` mirek=${light.colorTemperature}` : "";
  const reachable = light.reachable ? "" : " [unreachable]";
  return `[${light.id}] "${light.name}" ${state}${brightness}${temp}${reachable}`;
}

/**
 * Format a scene for display.
 */
export function formatScene(scene: HueScene): string {
  const group = scene.group ? ` group=${scene.group}` : "";
  return `[${scene.id}] "${scene.name}"${group}`;
}

/**
 * Format a room for display.
 */
export function formatRoom(room: HueRoom): string {
  return `[${room.id}] "${room.name}" lights=${room.lightIds.length}`;
}
