/**
 * Sonos HTTP API client.
 * Communicates with node-sonos-http-api (local HTTP endpoint).
 * Uses native fetch — no SDK dependency.
 */

import { z } from "zod";

export interface SonosConfig {
  apiUrl: string;
}

export interface SonosRoom {
  name: string;
  state: SonosState;
}

export interface SonosState {
  currentTrack: SonosTrack | null;
  volume: number;
  mute: boolean;
  playbackState: "PLAYING" | "PAUSED_PLAYBACK" | "STOPPED" | "TRANSITIONING" | string;
  playMode: string;
}

export interface SonosTrack {
  title: string;
  artist: string;
  album: string;
  duration: number;
  uri: string;
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Zod schemas for Sonos HTTP API response validation.
 */
const sonosTrackSchema = z.object({
  title: z.string().default(""),
  artist: z.string().default(""),
  album: z.string().default(""),
  duration: z.number().default(0),
  uri: z.string().default(""),
}).passthrough();

const sonosStateSchema = z.object({
  currentTrack: sonosTrackSchema.nullable().default(null),
  volume: z.number().default(0),
  mute: z.boolean().default(false),
  playbackState: z.string().default("STOPPED"),
  playMode: z.object({
    repeat: z.string().optional(),
    shuffle: z.boolean().optional(),
    crossfade: z.boolean().optional(),
  }).or(z.string()).default("NORMAL"),
}).passthrough();

const sonosZonesSchema = z.array(z.object({
  coordinator: z.object({
    roomName: z.string(),
    state: sonosStateSchema,
  }).passthrough(),
}).passthrough());

/**
 * Normalize the Sonos HTTP API base URL (strip trailing slash).
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Encode a room name for URL path segments.
 */
function encodeRoom(roomName: string): string {
  return encodeURIComponent(roomName);
}

/**
 * Make a request to the Sonos HTTP API.
 */
async function sonosRequest(config: SonosConfig, path: string): Promise<unknown> {
  const url = `${normalizeUrl(config.apiUrl)}${path}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sonos API ${res.status}: ${text}`);
  }

  // Some Sonos endpoints return plain text (e.g., "OK")
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  const text = await res.text();
  // Try parsing as JSON anyway (some versions don't set content-type)
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Check if the Sonos HTTP API is reachable.
 */
export async function checkConnection(config: SonosConfig): Promise<boolean> {
  try {
    await sonosRequest(config, "/zones");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all zones (rooms) and their current state.
 */
export async function getZones(config: SonosConfig): Promise<SonosRoom[]> {
  const data = await sonosRequest(config, "/zones");
  const parsed = sonosZonesSchema.safeParse(data);

  if (!parsed.success) return [];

  return parsed.data.map((zone) => ({
    name: zone.coordinator.roomName,
    state: mapState(zone.coordinator.state),
  }));
}

/**
 * Get the state of a specific room.
 */
export async function getRoomState(config: SonosConfig, roomName: string): Promise<SonosState> {
  const data = await sonosRequest(config, `/${encodeRoom(roomName)}/state`);
  const parsed = sonosStateSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error("Could not parse room state from Sonos API");
  }

  return mapState(parsed.data);
}

/**
 * Map raw Sonos state to our SonosState interface.
 */
function mapState(raw: z.infer<typeof sonosStateSchema>): SonosState {
  const track = raw.currentTrack
    ? {
      title: raw.currentTrack.title,
      artist: raw.currentTrack.artist,
      album: raw.currentTrack.album,
      duration: raw.currentTrack.duration,
      uri: raw.currentTrack.uri,
    }
    : null;

  return {
    currentTrack: track,
    volume: raw.volume,
    mute: raw.mute,
    playbackState: raw.playbackState,
    playMode: typeof raw.playMode === "string" ? raw.playMode : "NORMAL",
  };
}

/**
 * Play the current queue or resume playback.
 */
export async function play(config: SonosConfig, roomName: string): Promise<string> {
  await sonosRequest(config, `/${encodeRoom(roomName)}/play`);
  return `${roomName}: playback started`;
}

/**
 * Pause playback.
 */
export async function pause(config: SonosConfig, roomName: string): Promise<string> {
  await sonosRequest(config, `/${encodeRoom(roomName)}/pause`);
  return `${roomName}: playback paused`;
}

/**
 * Stop playback.
 */
export async function stop(config: SonosConfig, roomName: string): Promise<string> {
  await sonosRequest(config, `/${encodeRoom(roomName)}/stop`);
  return `${roomName}: playback stopped`;
}

/**
 * Skip to next track.
 */
export async function next(config: SonosConfig, roomName: string): Promise<string> {
  await sonosRequest(config, `/${encodeRoom(roomName)}/next`);
  return `${roomName}: skipped to next track`;
}

/**
 * Skip to previous track.
 */
export async function previous(config: SonosConfig, roomName: string): Promise<string> {
  await sonosRequest(config, `/${encodeRoom(roomName)}/previous`);
  return `${roomName}: skipped to previous track`;
}

/**
 * Set volume (0-100).
 */
export async function setVolume(config: SonosConfig, roomName: string, level: number): Promise<string> {
  const clamped = Math.max(0, Math.min(100, Math.round(level)));
  await sonosRequest(config, `/${encodeRoom(roomName)}/volume/${clamped}`);
  return `${roomName}: volume set to ${clamped}`;
}

/**
 * Play a favorite by name.
 */
export async function playFavorite(config: SonosConfig, roomName: string, favoriteName: string): Promise<string> {
  await sonosRequest(config, `/${encodeRoom(roomName)}/favorite/${encodeURIComponent(favoriteName)}`);
  return `${roomName}: playing favorite "${favoriteName}"`;
}

/**
 * Set mute state.
 */
export async function setMute(config: SonosConfig, roomName: string, mute: boolean): Promise<string> {
  const action = mute ? "mute" : "unmute";
  await sonosRequest(config, `/${encodeRoom(roomName)}/${action}`);
  return `${roomName}: ${action}d`;
}

/**
 * Get list of favorites (playlists, radio stations).
 */
export async function getFavorites(config: SonosConfig): Promise<string[]> {
  const data = await sonosRequest(config, "/favorites");

  if (Array.isArray(data)) {
    return data
      .filter((item): item is { title: string } =>
        typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).title === "string",
      )
      .map((item) => item.title);
  }

  return [];
}

/**
 * Format a room's state for display.
 */
export function formatRoom(room: SonosRoom): string {
  const track = room.state.currentTrack;
  const trackStr = track && track.title
    ? ` "${track.artist} — ${track.title}"`
    : "";
  const muteStr = room.state.mute ? " [MUTED]" : "";
  return `[${room.name}] ${room.state.playbackState} vol=${room.state.volume}${muteStr}${trackStr}`;
}
