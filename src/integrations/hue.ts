export interface HueConfig {
  bridgeIp: string;
  apiKey: string;
}

let hueConfig: HueConfig | null = null;

export function setHueConfig(config: HueConfig): void {
  hueConfig = config;
}

export function getHueConfig(): HueConfig | null {
  return hueConfig;
}

const FETCH_TIMEOUT_MS = 10_000;

export interface HueLight {
  id: string;
  name: string;
  on: boolean;
  brightness?: number;
}

export interface HueScene {
  id: string;
  name: string;
}

/**
 * Get all lights from the Hue bridge (API v2).
 */
export async function getLights(): Promise<HueLight[]> {
  if (!hueConfig) throw new Error("Hue not configured — call setHueConfig() first");

  const res = await fetch(`https://${hueConfig.bridgeIp}/clip/v2/resource/light`, {
    headers: { "hue-application-key": hueConfig.apiKey },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Hue API returned ${res.status}`);

  const data = await res.json() as {
    data?: Array<{
      id?: string;
      metadata?: { name?: string };
      on?: { on?: boolean };
      dimming?: { brightness?: number };
    }>;
  };

  return (data.data ?? [])
    .filter((l) => l.id && l.metadata?.name)
    .map((l) => ({
      id: l.id!,
      name: l.metadata!.name!,
      on: l.on?.on ?? false,
      brightness: l.dimming?.brightness,
    }));
}

export interface LightState {
  on?: boolean;
  brightness?: number;
  color?: { x: number; y: number };
}

/**
 * Set the state of a specific light.
 */
export async function setLightState(id: string, state: LightState): Promise<boolean> {
  if (!hueConfig) throw new Error("Hue not configured — call setHueConfig() first");

  const body: Record<string, unknown> = {};
  if (state.on !== undefined) body.on = { on: state.on };
  if (state.brightness !== undefined) body.dimming = { brightness: state.brightness };
  if (state.color) body.color = { xy: state.color };

  const res = await fetch(`https://${hueConfig.bridgeIp}/clip/v2/resource/light/${id}`, {
    method: "PUT",
    headers: {
      "hue-application-key": hueConfig.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  return res.ok;
}

/**
 * Get all scenes from the Hue bridge.
 */
export async function getScenes(): Promise<HueScene[]> {
  if (!hueConfig) throw new Error("Hue not configured — call setHueConfig() first");

  const res = await fetch(`https://${hueConfig.bridgeIp}/clip/v2/resource/scene`, {
    headers: { "hue-application-key": hueConfig.apiKey },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Hue API returned ${res.status}`);

  const data = await res.json() as {
    data?: Array<{ id?: string; metadata?: { name?: string } }>;
  };

  return (data.data ?? [])
    .filter((s) => s.id && s.metadata?.name)
    .map((s) => ({ id: s.id!, name: s.metadata!.name! }));
}

/**
 * Activate a scene by ID.
 */
export async function activateScene(id: string): Promise<boolean> {
  if (!hueConfig) throw new Error("Hue not configured — call setHueConfig() first");

  const res = await fetch(`https://${hueConfig.bridgeIp}/clip/v2/resource/scene/${id}`, {
    method: "PUT",
    headers: {
      "hue-application-key": hueConfig.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recall: { action: "active" } }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  return res.ok;
}
