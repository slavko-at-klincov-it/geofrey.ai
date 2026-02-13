import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import { getLights, setLightState, getScenes, activateScene, getHueConfig } from "../integrations/hue.js";
import { getStates, callService, getHaConfig } from "../integrations/homeassistant.js";
import { getZones, play, pause, setVolume, getSonosConfig } from "../integrations/sonos.js";
import { discoverAll } from "../integrations/discovery.js";
import { t } from "../i18n/index.js";

function isAnyConfigured(): boolean {
  return !!(getHueConfig() || getHaConfig() || getSonosConfig());
}

registerTool({
  name: "smart_home",
  description: "Control smart home devices: Philips Hue lights, HomeAssistant entities, and Sonos speakers.",
  parameters: z.object({
    action: z.enum(["discover", "list", "control", "scene"]),
    provider: z.enum(["hue", "homeassistant", "sonos"]).optional().describe("Smart home provider"),
    deviceId: z.string().optional().describe("Device/entity ID"),
    state: z.object({
      on: z.boolean().optional(),
      brightness: z.number().optional(),
    }).optional().describe("Desired state (for control)"),
    sceneId: z.string().optional().describe("Scene ID to activate"),
    room: z.string().optional().describe("Room name (for Sonos)"),
    command: z.string().optional().describe("Sonos command: play, pause, volume"),
    value: z.coerce.number().optional().describe("Volume value (0-100)"),
  }),
  source: "native",
  execute: async ({ action, provider, deviceId, state, sceneId, room, command, value }) => {
    switch (action) {
      case "discover": {
        try {
          const results = await discoverAll();
          const lines: string[] = [];
          if (results.hue) lines.push(`Hue Bridge: ${results.hue}`);
          if (results.sonos.length > 0) lines.push(`Sonos: ${results.sonos.join(", ")}`);
          if (lines.length === 0) return t("smartHome.listEmpty");
          return t("smartHome.discovered", { count: String(lines.length) }) + "\n" + lines.join("\n");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Discovery failed: ${msg}`;
        }
      }

      case "list": {
        if (!isAnyConfigured()) return t("smartHome.notConfigured");
        const lines: string[] = [];

        if (getHueConfig()) {
          try {
            const lights = await getLights();
            lines.push(`**Hue Lights (${lights.length}):**`);
            for (const l of lights) {
              lines.push(`  - ${l.name} (${l.id}): ${l.on ? "on" : "off"}${l.brightness ? ` ${l.brightness}%` : ""}`);
            }
          } catch (err) {
            lines.push(`Hue: error — ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (getHaConfig()) {
          try {
            const states = await getStates();
            lines.push(`**HomeAssistant (${states.length} entities):**`);
            for (const s of states.slice(0, 20)) {
              lines.push(`  - ${s.entity_id}: ${s.state}`);
            }
            if (states.length > 20) lines.push(`  ... and ${states.length - 20} more`);
          } catch (err) {
            lines.push(`HA: error — ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (getSonosConfig()) {
          try {
            const zones = await getZones();
            lines.push(`**Sonos (${zones.length} zones):**`);
            for (const z of zones) {
              lines.push(`  - ${z.name}: ${z.state} vol=${z.volume}`);
            }
          } catch (err) {
            lines.push(`Sonos: error — ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (lines.length === 0) return t("smartHome.listEmpty");
        return t("smartHome.listHeader", { count: String(lines.length) }) + "\n" + lines.join("\n");
      }

      case "control": {
        if (!provider) return t("smartHome.providerRequired");

        switch (provider) {
          case "hue": {
            if (!deviceId) return t("tools.paramRequired", { param: "deviceId", action: "control" });
            const ok = await setLightState(deviceId, state ?? {});
            return ok
              ? t("smartHome.controlled", { device: deviceId })
              : `Failed to control Hue light ${deviceId}`;
          }
          case "homeassistant": {
            if (!deviceId) return t("tools.paramRequired", { param: "deviceId", action: "control" });
            const domain = deviceId.split(".")[0] ?? "homeassistant";
            const service = state?.on === true ? "turn_on" : state?.on === false ? "turn_off" : "toggle";
            const ok = await callService(domain, service, deviceId);
            return ok
              ? t("smartHome.controlled", { device: deviceId })
              : `Failed to control HA entity ${deviceId}`;
          }
          case "sonos": {
            if (!room) return t("tools.paramRequired", { param: "room", action: "control" });
            let ok = false;
            switch (command) {
              case "play": ok = await play(room); break;
              case "pause": ok = await pause(room); break;
              case "volume":
                if (value === undefined) return t("tools.paramRequired", { param: "value", action: "volume" });
                ok = await setVolume(room, value);
                break;
              default: ok = await play(room); break;
            }
            return ok
              ? t("smartHome.controlled", { device: room })
              : `Failed to control Sonos room ${room}`;
          }
        }
        break;
      }

      case "scene": {
        if (!sceneId) return t("tools.paramRequired", { param: "sceneId", action: "scene" });
        if (provider === "homeassistant") {
          const ok = await callService("scene", "turn_on", sceneId);
          return ok
            ? t("smartHome.sceneFired", { scene: sceneId })
            : `Failed to activate HA scene ${sceneId}`;
        }
        // Default to Hue
        const ok = await activateScene(sceneId);
        return ok
          ? t("smartHome.sceneFired", { scene: sceneId })
          : `Failed to activate Hue scene ${sceneId}`;
      }

      default:
        return t("tools.unknownAction", { action: String(action) });
    }
    return t("tools.unknownAction", { action: String(action) });
  },
});
