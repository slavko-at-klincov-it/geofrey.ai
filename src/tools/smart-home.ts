/**
 * Unified smart home tool — discover, list, control devices across Hue, HomeAssistant, and Sonos.
 */

import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import * as hue from "../integrations/hue.js";
import * as ha from "../integrations/homeassistant.js";
import * as sonos from "../integrations/sonos.js";
import { discoverAll } from "../integrations/discovery.js";

export interface SmartHomeConfig {
  hue?: hue.HueConfig;
  homeassistant?: ha.HomeAssistantConfig;
  sonos?: sonos.SonosConfig;
}

let config: SmartHomeConfig | null = null;

/**
 * Set the smart home configuration. Call before using the tool.
 */
export function setSmartHomeConfig(cfg: SmartHomeConfig): void {
  config = cfg;
}

/**
 * Get the current smart home configuration (for testing).
 */
export function getSmartHomeConfig(): SmartHomeConfig | null {
  return config;
}

/**
 * Check which platforms are reachable. Logs warnings for configured but unreachable platforms.
 */
export async function checkPlatformAvailability(): Promise<Record<string, boolean>> {
  if (!config) return {};

  const results: Record<string, boolean> = {};

  const checks: Array<Promise<void>> = [];

  if (config.hue) {
    const hueConfig = config.hue;
    checks.push(
      hue.checkConnection(hueConfig).then((ok) => { results.hue = ok; }),
    );
  }

  if (config.homeassistant) {
    const haConfig = config.homeassistant;
    checks.push(
      ha.checkConnection(haConfig).then((ok) => { results.homeassistant = ok; }),
    );
  }

  if (config.sonos) {
    const sonosConfig = config.sonos;
    checks.push(
      sonos.checkConnection(sonosConfig).then((ok) => { results.sonos = ok; }),
    );
  }

  await Promise.all(checks);
  return results;
}

/**
 * Handle the "discover" action — scan network for smart home devices.
 */
async function handleDiscover(): Promise<string> {
  try {
    const devices = await discoverAll();
    if (devices.length === 0) {
      return "No smart home devices found on the network. Ensure devices are powered on and connected to the same network.";
    }

    const lines = devices.map((d) => `[${d.type}] ${d.name} — ${d.ip}:${d.port}`);
    return `Found ${devices.length} device(s):\n${lines.join("\n")}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Discovery failed: ${msg}`;
  }
}

/**
 * Handle the "list" action — list all devices and their states.
 */
async function handleList(platform?: string, domain?: string): Promise<string> {
  if (!config) return "Error: smart home not configured";

  const sections: string[] = [];

  // Hue
  if ((!platform || platform === "hue") && config.hue) {
    try {
      const lights = await hue.getLights(config.hue);
      const rooms = await hue.getRooms(config.hue);
      const scenes = await hue.getScenes(config.hue);

      const lightLines = lights.map(hue.formatLight);
      const roomLines = rooms.map(hue.formatRoom);
      const sceneLines = scenes.map(hue.formatScene);

      sections.push([
        "=== Philips Hue ===",
        `Lights (${lights.length}):`,
        ...lightLines,
        `\nRooms (${rooms.length}):`,
        ...roomLines,
        `\nScenes (${scenes.length}):`,
        ...sceneLines,
      ].join("\n"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sections.push(`=== Philips Hue ===\nError: ${msg}`);
    }
  }

  // HomeAssistant
  if ((!platform || platform === "homeassistant") && config.homeassistant) {
    try {
      const entities = await ha.getStates(config.homeassistant, domain);
      const entityLines = entities.map(ha.formatEntity);

      const domainLabel = domain ? ` (${domain})` : "";
      sections.push([
        `=== HomeAssistant${domainLabel} ===`,
        `Entities (${entities.length}):`,
        ...entityLines,
      ].join("\n"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sections.push(`=== HomeAssistant ===\nError: ${msg}`);
    }
  }

  // Sonos
  if ((!platform || platform === "sonos") && config.sonos) {
    try {
      const zones = await sonos.getZones(config.sonos);
      const zoneLines = zones.map(sonos.formatRoom);

      sections.push([
        "=== Sonos ===",
        `Rooms (${zones.length}):`,
        ...zoneLines,
      ].join("\n"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sections.push(`=== Sonos ===\nError: ${msg}`);
    }
  }

  if (sections.length === 0) {
    return "No smart home platforms configured. Set HUE_BRIDGE_IP, HA_URL, or SONOS_API_URL in .env";
  }

  return sections.join("\n\n");
}

/**
 * Handle the "control" action — control a specific device.
 */
async function handleControl(
  platform: string,
  entity: string,
  action: string,
  value?: string,
): Promise<string> {
  if (!config) return "Error: smart home not configured";

  switch (platform) {
    case "hue": {
      if (!config.hue) return "Error: Hue not configured";

      switch (action) {
        case "on":
          return hue.controlLight(config.hue, entity, { on: true });
        case "off":
          return hue.controlLight(config.hue, entity, { on: false });
        case "brightness": {
          const brightness = Number(value);
          if (!Number.isFinite(brightness)) return "Error: brightness must be a number (0-100)";
          return hue.controlLight(config.hue, entity, { brightness });
        }
        case "color_temp": {
          const mirek = Number(value);
          if (!Number.isFinite(mirek)) return "Error: color_temp must be a mirek value (153-500)";
          return hue.controlLight(config.hue, entity, { colorTemperatureMirek: mirek });
        }
        case "color_xy": {
          if (!value) return "Error: color_xy requires 'x,y' value (e.g., '0.3,0.3')";
          const parts = value.split(",");
          if (parts.length !== 2) return "Error: color_xy format is 'x,y' (e.g., '0.3,0.3')";
          const x = Number(parts[0]);
          const y = Number(parts[1]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return "Error: x and y must be numbers";
          return hue.controlLight(config.hue, entity, { colorXy: { x, y } });
        }
        default:
          return `Error: unknown Hue action "${action}". Supported: on, off, brightness, color_temp, color_xy`;
      }
    }

    case "homeassistant": {
      if (!config.homeassistant) return "Error: HomeAssistant not configured";

      // Parse entity domain for service routing
      const dotIdx = entity.indexOf(".");
      const domain = dotIdx > 0 ? entity.slice(0, dotIdx) : "homeassistant";

      // Map common actions to HA service calls
      const serviceMap: Record<string, string> = {
        on: "turn_on",
        off: "turn_off",
        toggle: "toggle",
        lock: "lock",
        unlock: "unlock",
        open: "open_cover",
        close: "close_cover",
        stop: "stop_cover",
      };

      const service = serviceMap[action] ?? action;
      const data = value ? parseServiceData(value) : undefined;

      return ha.callService(config.homeassistant, {
        domain,
        service,
        entityId: entity,
        data,
      });
    }

    case "sonos": {
      if (!config.sonos) return "Error: Sonos not configured";

      switch (action) {
        case "play":
          return sonos.play(config.sonos, entity);
        case "pause":
          return sonos.pause(config.sonos, entity);
        case "stop":
          return sonos.stop(config.sonos, entity);
        case "next":
          return sonos.next(config.sonos, entity);
        case "previous":
          return sonos.previous(config.sonos, entity);
        case "volume": {
          const level = Number(value);
          if (!Number.isFinite(level)) return "Error: volume must be a number (0-100)";
          return sonos.setVolume(config.sonos, entity, level);
        }
        case "mute":
          return sonos.setMute(config.sonos, entity, true);
        case "unmute":
          return sonos.setMute(config.sonos, entity, false);
        case "favorite":
          if (!value) return "Error: favorite name is required";
          return sonos.playFavorite(config.sonos, entity, value);
        default:
          return `Error: unknown Sonos action "${action}". Supported: play, pause, stop, next, previous, volume, mute, unmute, favorite`;
      }
    }

    default:
      return `Error: unknown platform "${platform}". Supported: hue, homeassistant, sonos`;
  }
}

/**
 * Handle the "scene" action — activate a scene on the specified platform.
 */
async function handleScene(platform: string, sceneName: string): Promise<string> {
  if (!config) return "Error: smart home not configured";

  switch (platform) {
    case "hue": {
      if (!config.hue) return "Error: Hue not configured";

      // Try to find scene by name first, then by ID
      const scenes = await hue.getScenes(config.hue);
      const scene = scenes.find((s) =>
        s.id === sceneName || s.name.toLowerCase() === sceneName.toLowerCase(),
      );

      if (!scene) {
        const available = scenes.map((s) => `"${s.name}" (${s.id})`).join(", ");
        return `Scene "${sceneName}" not found. Available: ${available || "none"}`;
      }

      return hue.recallScene(config.hue, scene.id);
    }

    case "homeassistant": {
      if (!config.homeassistant) return "Error: HomeAssistant not configured";

      // HA scenes use entity IDs like "scene.movie_night"
      const entityId = sceneName.startsWith("scene.")
        ? sceneName
        : `scene.${sceneName}`;

      return ha.activateScene(config.homeassistant, entityId);
    }

    case "sonos": {
      if (!config.sonos) return "Error: Sonos not configured";
      // Sonos doesn't have "scenes" — use favorites instead
      return "Sonos does not support scenes. Use 'control sonos <room> favorite <name>' to play a favorite.";
    }

    default:
      return `Error: unknown platform "${platform}". Supported: hue, homeassistant, sonos`;
  }
}

/**
 * Handle the "automation" action — trigger an automation on the specified platform.
 */
async function handleAutomation(platform: string, automationId: string): Promise<string> {
  if (!config) return "Error: smart home not configured";

  switch (platform) {
    case "homeassistant": {
      if (!config.homeassistant) return "Error: HomeAssistant not configured";

      const entityId = automationId.startsWith("automation.")
        ? automationId
        : `automation.${automationId}`;

      return ha.triggerAutomation(config.homeassistant, entityId);
    }

    case "hue":
      return "Hue does not support automations via API. Use HomeAssistant for automations.";

    case "sonos":
      return "Sonos does not support automations. Use HomeAssistant for automations.";

    default:
      return `Error: unknown platform "${platform}". Supported: homeassistant`;
  }
}

/**
 * Parse a value string into service data.
 * Supports key=value pairs separated by commas.
 * E.g., "temperature=22,hvac_mode=heat" → { temperature: 22, hvac_mode: "heat" }
 */
function parseServiceData(value: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const pairs = value.split(",");

  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx <= 0) continue;

    const key = pair.slice(0, eqIdx).trim();
    const rawVal = pair.slice(eqIdx + 1).trim();

    // Try to parse as number
    const num = Number(rawVal);
    if (Number.isFinite(num)) {
      data[key] = num;
      continue;
    }

    // Try to parse as boolean
    if (rawVal === "true") { data[key] = true; continue; }
    if (rawVal === "false") { data[key] = false; continue; }

    // Keep as string
    data[key] = rawVal;
  }

  return data;
}

registerTool({
  name: "smart_home",
  description: [
    "Control smart home devices (Philips Hue, HomeAssistant, Sonos).",
    "Actions:",
    "  discover — scan network for smart home devices",
    "  list — list all configured devices and their states",
    "  control <platform> <entity> <action> [value] — control a device",
    "  scene <platform> <scene-name> — activate a scene",
    "  automation <platform> <automation-id> — trigger an automation",
    "Platforms: hue, homeassistant, sonos",
    "Hue actions: on, off, brightness (0-100), color_temp (153-500 mirek), color_xy (x,y)",
    "HA actions: on, off, toggle, lock, unlock, open, close, stop, or any HA service name",
    "Sonos actions: play, pause, stop, next, previous, volume (0-100), mute, unmute, favorite",
  ].join("\n"),
  parameters: z.object({
    action: z.enum(["discover", "list", "control", "scene", "automation"]),
    platform: z.enum(["hue", "homeassistant", "sonos"]).optional()
      .describe("Smart home platform (required for control/scene/automation)"),
    entity: z.string().optional()
      .describe("Entity/device/room ID (required for control)"),
    command: z.string().optional()
      .describe("Device command: on, off, brightness, volume, play, pause, etc. (required for control)"),
    value: z.string().optional()
      .describe("Command value (e.g., brightness level, favorite name, key=value pairs)"),
    domain: z.string().optional()
      .describe("Entity domain filter for list action (e.g., light, switch, sensor)"),
    sceneName: z.string().optional()
      .describe("Scene name or ID (required for scene action)"),
    automationId: z.string().optional()
      .describe("Automation entity ID (required for automation action)"),
  }),
  source: "native",
  execute: async ({ action, platform, entity, command, value, domain, sceneName, automationId }) => {
    try {
      switch (action) {
        case "discover":
          return await handleDiscover();

        case "list":
          return await handleList(platform, domain);

        case "control": {
          if (!platform) return "Error: 'platform' is required for control";
          if (!entity) return "Error: 'entity' is required for control";
          if (!command) return "Error: 'command' is required for control";
          return await handleControl(platform, entity, command, value);
        }

        case "scene": {
          if (!platform) return "Error: 'platform' is required for scene";
          if (!sceneName) return "Error: 'sceneName' is required for scene";
          return await handleScene(platform, sceneName);
        }

        case "automation": {
          if (!platform) return "Error: 'platform' is required for automation";
          if (!automationId) return "Error: 'automationId' is required for automation";
          return await handleAutomation(platform, automationId);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Smart home error: ${msg}`;
    }
  },
});

// Re-export for integration layer
export { setSmartHomeConfig as initSmartHome };
