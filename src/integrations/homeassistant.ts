/**
 * HomeAssistant REST API client.
 * Uses native fetch — no SDK dependency.
 * Requires a Long-Lived Access Token from HA Settings → Security.
 */

import { z } from "zod";

export interface HomeAssistantConfig {
  url: string;
  token: string;
}

export interface HaEntity {
  entityId: string;
  domain: string;
  state: string;
  friendlyName: string;
  attributes: Record<string, unknown>;
  lastChanged: string;
}

export interface HaServiceCall {
  domain: string;
  service: string;
  entityId?: string;
  data?: Record<string, unknown>;
}

export interface HaInstanceInfo {
  version: string;
  locationName: string;
  timezone: string;
  components: string[];
}

const FETCH_TIMEOUT_MS = 10_000;

/** Domains we surface to users by default. */
const SUPPORTED_DOMAINS = new Set([
  "light",
  "switch",
  "sensor",
  "climate",
  "media_player",
  "cover",
  "fan",
  "lock",
  "vacuum",
  "automation",
  "scene",
  "script",
]);

/**
 * Zod schemas for HA API response validation.
 */
const haStateSchema = z.object({
  entity_id: z.string(),
  state: z.string(),
  attributes: z.record(z.unknown()).default({}),
  last_changed: z.string().default(""),
});

const haConfigSchema = z.object({
  version: z.string().default("unknown"),
  location_name: z.string().default("Home"),
  time_zone: z.string().default("UTC"),
  components: z.array(z.string()).default([]),
});

const haServiceResponseSchema = z.array(z.unknown()).or(z.object({})).or(z.null());

/**
 * Build authorization headers for HA REST API.
 */
function authHeaders(config: HomeAssistantConfig): Record<string, string> {
  return {
    "Authorization": `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Normalize the HA base URL (strip trailing slash).
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Make an authenticated request to HomeAssistant.
 */
async function haRequest(
  config: HomeAssistantConfig,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const url = `${normalizeUrl(config.url)}${path}`;
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
    throw new Error(`HomeAssistant API ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Extract domain from an entity ID (e.g., "light.living_room" → "light").
 */
function extractDomain(entityId: string): string {
  const dotIdx = entityId.indexOf(".");
  return dotIdx > 0 ? entityId.slice(0, dotIdx) : entityId;
}

/**
 * Check if HomeAssistant is reachable and the token is valid.
 */
export async function checkConnection(config: HomeAssistantConfig): Promise<boolean> {
  try {
    await haRequest(config, "GET", "/api/");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get HomeAssistant instance info.
 */
export async function getInstanceInfo(config: HomeAssistantConfig): Promise<HaInstanceInfo> {
  const data = await haRequest(config, "GET", "/api/config");
  const parsed = haConfigSchema.parse(data);
  return {
    version: parsed.version,
    locationName: parsed.location_name,
    timezone: parsed.time_zone,
    components: parsed.components,
  };
}

/**
 * Get all entity states, optionally filtered by domain.
 */
export async function getStates(
  config: HomeAssistantConfig,
  domainFilter?: string,
): Promise<HaEntity[]> {
  const data = await haRequest(config, "GET", "/api/states");

  if (!Array.isArray(data)) return [];

  const entities: HaEntity[] = [];
  for (const raw of data) {
    const parsed = haStateSchema.safeParse(raw);
    if (!parsed.success) continue;

    const entity = parsed.data;
    const domain = extractDomain(entity.entity_id);

    // Filter by domain if specified
    if (domainFilter && domain !== domainFilter) continue;

    // Only include supported domains (unless a specific filter was requested)
    if (!domainFilter && !SUPPORTED_DOMAINS.has(domain)) continue;

    const friendlyName = typeof entity.attributes.friendly_name === "string"
      ? entity.attributes.friendly_name
      : entity.entity_id;

    entities.push({
      entityId: entity.entity_id,
      domain,
      state: entity.state,
      friendlyName,
      attributes: entity.attributes,
      lastChanged: entity.last_changed,
    });
  }

  return entities;
}

/**
 * Call a HomeAssistant service.
 *
 * Examples:
 *   callService(config, { domain: "light", service: "turn_on", entityId: "light.living_room" })
 *   callService(config, { domain: "climate", service: "set_temperature", entityId: "climate.thermostat", data: { temperature: 22 } })
 */
export async function callService(
  config: HomeAssistantConfig,
  call: HaServiceCall,
): Promise<string> {
  const path = `/api/services/${call.domain}/${call.service}`;
  const body: Record<string, unknown> = {};

  if (call.entityId) {
    body.entity_id = call.entityId;
  }
  if (call.data) {
    Object.assign(body, call.data);
  }

  const data = await haRequest(config, "POST", path, body);

  // HA returns affected states or empty array
  const parsed = haServiceResponseSchema.safeParse(data);
  if (!parsed.success) {
    return `Service ${call.domain}/${call.service} called (response could not be parsed)`;
  }

  if (Array.isArray(parsed.data)) {
    return `Service ${call.domain}/${call.service} called — ${parsed.data.length} entities affected`;
  }

  return `Service ${call.domain}/${call.service} called`;
}

/**
 * Trigger a HomeAssistant automation by entity ID.
 */
export async function triggerAutomation(
  config: HomeAssistantConfig,
  automationEntityId: string,
): Promise<string> {
  return callService(config, {
    domain: "automation",
    service: "trigger",
    entityId: automationEntityId,
  });
}

/**
 * Activate a HomeAssistant scene by entity ID.
 */
export async function activateScene(
  config: HomeAssistantConfig,
  sceneEntityId: string,
): Promise<string> {
  return callService(config, {
    domain: "scene",
    service: "turn_on",
    entityId: sceneEntityId,
  });
}

/**
 * Format an entity for display.
 */
export function formatEntity(entity: HaEntity): string {
  const attrs: string[] = [];

  // Include relevant attributes based on domain
  if (entity.domain === "climate") {
    const temp = entity.attributes.current_temperature;
    const target = entity.attributes.temperature;
    if (temp !== undefined) attrs.push(`current=${temp}`);
    if (target !== undefined) attrs.push(`target=${target}`);
  }
  if (entity.domain === "light") {
    const brightness = entity.attributes.brightness;
    if (brightness !== undefined) {
      const pct = Math.round((Number(brightness) / 255) * 100);
      attrs.push(`brightness=${pct}%`);
    }
  }
  if (entity.domain === "media_player") {
    const source = entity.attributes.source;
    if (source !== undefined) attrs.push(`source=${source}`);
  }
  if (entity.domain === "sensor") {
    const unit = entity.attributes.unit_of_measurement;
    if (unit !== undefined) attrs.push(`unit=${unit}`);
  }

  const attrStr = attrs.length > 0 ? ` (${attrs.join(", ")})` : "";
  return `[${entity.entityId}] "${entity.friendlyName}" state=${entity.state}${attrStr}`;
}
