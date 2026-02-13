export interface SonosConfig {
  httpApiUrl: string;
}

let sonosConfig: SonosConfig | null = null;

export function setSonosConfig(config: SonosConfig): void {
  sonosConfig = config;
}

export function getSonosConfig(): SonosConfig | null {
  return sonosConfig;
}

const FETCH_TIMEOUT_MS = 10_000;

export interface SonosZone {
  name: string;
  state: string;
  volume: number;
}

/**
 * Get all Sonos zones via sonos-http-api.
 */
export async function getZones(): Promise<SonosZone[]> {
  if (!sonosConfig) throw new Error("Sonos not configured — call setSonosConfig() first");

  const res = await fetch(`${sonosConfig.httpApiUrl}/zones`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Sonos HTTP API returned ${res.status}`);

  const data = await res.json() as Array<{
    coordinator?: {
      roomName?: string;
      state?: { playbackState?: string; volume?: number };
    };
  }>;

  return data
    .filter((z) => z.coordinator?.roomName)
    .map((z) => ({
      name: z.coordinator!.roomName!,
      state: z.coordinator!.state?.playbackState ?? "unknown",
      volume: z.coordinator!.state?.volume ?? 0,
    }));
}

/**
 * Play music in a room (optionally a specific URI or favorite).
 */
export async function play(room: string, uri?: string): Promise<boolean> {
  if (!sonosConfig) throw new Error("Sonos not configured — call setSonosConfig() first");

  const encodedRoom = encodeURIComponent(room);
  const url = uri
    ? `${sonosConfig.httpApiUrl}/${encodedRoom}/play/${encodeURIComponent(uri)}`
    : `${sonosConfig.httpApiUrl}/${encodedRoom}/play`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return res.ok;
}

/**
 * Pause playback in a room.
 */
export async function pause(room: string): Promise<boolean> {
  if (!sonosConfig) throw new Error("Sonos not configured — call setSonosConfig() first");

  const res = await fetch(`${sonosConfig.httpApiUrl}/${encodeURIComponent(room)}/pause`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return res.ok;
}

/**
 * Set volume for a room (0-100).
 */
export async function setVolume(room: string, volume: number): Promise<boolean> {
  if (!sonosConfig) throw new Error("Sonos not configured — call setSonosConfig() first");

  const clamped = Math.max(0, Math.min(100, Math.round(volume)));
  const res = await fetch(
    `${sonosConfig.httpApiUrl}/${encodeURIComponent(room)}/volume/${clamped}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  return res.ok;
}
