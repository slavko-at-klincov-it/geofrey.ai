import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkConnection,
  getInstanceInfo,
  getStates,
  callService,
  triggerAutomation,
  activateScene,
  formatEntity,
  type HomeAssistantConfig,
  type HaEntity,
} from "./homeassistant.js";

const TEST_CONFIG: HomeAssistantConfig = {
  url: "http://192.168.1.50:8123",
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
};

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}) {
  return mock.method(globalThis, "fetch", () =>
    Promise.resolve({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: response.json ?? (() => Promise.resolve({})),
      text: response.text ?? (() => Promise.resolve("")),
    }),
  );
}

describe("homeassistant", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  describe("checkConnection", () => {
    it("returns true when HA responds", async () => {
      mockFetch({
        json: () => Promise.resolve({ message: "API running." }),
      });

      const ok = await checkConnection(TEST_CONFIG);
      assert.equal(ok, true);
    });

    it("returns false on error", async () => {
      mock.method(globalThis, "fetch", () =>
        Promise.reject(new Error("ECONNREFUSED")),
      );

      const ok = await checkConnection(TEST_CONFIG);
      assert.equal(ok, false);
    });

    it("returns false on 401 unauthorized", async () => {
      mockFetch({ ok: false, status: 401 });

      const ok = await checkConnection(TEST_CONFIG);
      assert.equal(ok, false);
    });
  });

  describe("getInstanceInfo", () => {
    it("parses HA config response", async () => {
      mockFetch({
        json: () => Promise.resolve({
          version: "2025.1.0",
          location_name: "Home",
          time_zone: "Europe/Berlin",
          components: ["light", "switch", "climate"],
        }),
      });

      const info = await getInstanceInfo(TEST_CONFIG);
      assert.equal(info.version, "2025.1.0");
      assert.equal(info.locationName, "Home");
      assert.equal(info.timezone, "Europe/Berlin");
      assert.deepEqual(info.components, ["light", "switch", "climate"]);
    });

    it("uses defaults for missing fields", async () => {
      mockFetch({
        json: () => Promise.resolve({}),
      });

      const info = await getInstanceInfo(TEST_CONFIG);
      assert.equal(info.version, "unknown");
      assert.equal(info.locationName, "Home");
    });
  });

  describe("getStates", () => {
    it("parses entity states and filters supported domains", async () => {
      mockFetch({
        json: () => Promise.resolve([
          {
            entity_id: "light.living_room",
            state: "on",
            attributes: { friendly_name: "Living Room Light", brightness: 200 },
            last_changed: "2025-01-01T00:00:00Z",
          },
          {
            entity_id: "switch.plug_1",
            state: "off",
            attributes: { friendly_name: "Smart Plug" },
            last_changed: "2025-01-01T00:00:00Z",
          },
          {
            entity_id: "persistent_notification.config_entry_discovery",
            state: "notifying",
            attributes: {},
            last_changed: "2025-01-01T00:00:00Z",
          },
        ]),
      });

      const entities = await getStates(TEST_CONFIG);
      assert.equal(entities.length, 2);
      assert.equal(entities[0].entityId, "light.living_room");
      assert.equal(entities[0].domain, "light");
      assert.equal(entities[0].friendlyName, "Living Room Light");
      assert.equal(entities[1].entityId, "switch.plug_1");
    });

    it("filters by domain when specified", async () => {
      mockFetch({
        json: () => Promise.resolve([
          { entity_id: "light.a", state: "on", attributes: {}, last_changed: "" },
          { entity_id: "switch.b", state: "off", attributes: {}, last_changed: "" },
          { entity_id: "light.c", state: "off", attributes: {}, last_changed: "" },
        ]),
      });

      const entities = await getStates(TEST_CONFIG, "light");
      assert.equal(entities.length, 2);
      assert.ok(entities.every((e) => e.domain === "light"));
    });

    it("returns empty array for non-array response", async () => {
      mockFetch({
        json: () => Promise.resolve({ error: "not found" }),
      });

      const entities = await getStates(TEST_CONFIG);
      assert.deepEqual(entities, []);
    });

    it("uses entity_id as friendly_name when not present", async () => {
      mockFetch({
        json: () => Promise.resolve([
          { entity_id: "light.no_name", state: "on", attributes: {} },
        ]),
      });

      const entities = await getStates(TEST_CONFIG);
      assert.equal(entities[0].friendlyName, "light.no_name");
    });

    it("skips malformed entries", async () => {
      mockFetch({
        json: () => Promise.resolve([
          { entity_id: "light.ok", state: "on", attributes: {} },
          "not an object",
          { missing_entity_id: true },
        ]),
      });

      const entities = await getStates(TEST_CONFIG);
      assert.equal(entities.length, 1);
    });
  });

  describe("callService", () => {
    it("calls HA service with entity and data", async () => {
      const fetchMock = mockFetch({
        json: () => Promise.resolve([{ entity_id: "light.living_room", state: "on" }]),
      });

      const result = await callService(TEST_CONFIG, {
        domain: "light",
        service: "turn_on",
        entityId: "light.living_room",
        data: { brightness: 200 },
      });

      assert.ok(result.includes("light/turn_on"));
      assert.ok(result.includes("1 entities affected"));

      const call = fetchMock.mock.calls[0];
      const url = call.arguments[0] as string;
      assert.ok(url.includes("/api/services/light/turn_on"));

      const body = JSON.parse(call.arguments[1]!.body as string);
      assert.equal(body.entity_id, "light.living_room");
      assert.equal(body.brightness, 200);
    });

    it("calls service without entity or data", async () => {
      mockFetch({
        json: () => Promise.resolve([]),
      });

      const result = await callService(TEST_CONFIG, {
        domain: "homeassistant",
        service: "restart",
      });

      assert.ok(result.includes("homeassistant/restart"));
    });

    it("handles non-array response", async () => {
      mockFetch({
        json: () => Promise.resolve({}),
      });

      const result = await callService(TEST_CONFIG, {
        domain: "light",
        service: "turn_off",
        entityId: "light.test",
      });

      assert.ok(result.includes("light/turn_off"));
    });

    it("throws on HTTP error", async () => {
      mockFetch({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Service not found"),
      });

      await assert.rejects(
        () => callService(TEST_CONFIG, { domain: "fake", service: "missing" }),
        (err: Error) => {
          assert.ok(err.message.includes("404"));
          return true;
        },
      );
    });
  });

  describe("triggerAutomation", () => {
    it("calls automation.trigger service", async () => {
      const fetchMock = mockFetch({
        json: () => Promise.resolve([]),
      });

      await triggerAutomation(TEST_CONFIG, "automation.morning_routine");

      const call = fetchMock.mock.calls[0];
      const url = call.arguments[0] as string;
      assert.ok(url.includes("/api/services/automation/trigger"));

      const body = JSON.parse(call.arguments[1]!.body as string);
      assert.equal(body.entity_id, "automation.morning_routine");
    });
  });

  describe("activateScene", () => {
    it("calls scene.turn_on service", async () => {
      const fetchMock = mockFetch({
        json: () => Promise.resolve([]),
      });

      await activateScene(TEST_CONFIG, "scene.movie_night");

      const call = fetchMock.mock.calls[0];
      const url = call.arguments[0] as string;
      assert.ok(url.includes("/api/services/scene/turn_on"));

      const body = JSON.parse(call.arguments[1]!.body as string);
      assert.equal(body.entity_id, "scene.movie_night");
    });
  });

  describe("formatEntity", () => {
    it("formats light entity with brightness", () => {
      const entity: HaEntity = {
        entityId: "light.living_room",
        domain: "light",
        state: "on",
        friendlyName: "Living Room",
        attributes: { brightness: 200 },
        lastChanged: "",
      };
      const str = formatEntity(entity);
      assert.ok(str.includes("Living Room"));
      assert.ok(str.includes("state=on"));
      assert.ok(str.includes("brightness=78%")); // 200/255 * 100 ≈ 78
    });

    it("formats climate entity with temperatures", () => {
      const entity: HaEntity = {
        entityId: "climate.thermostat",
        domain: "climate",
        state: "heat",
        friendlyName: "Thermostat",
        attributes: { current_temperature: 20.5, temperature: 22 },
        lastChanged: "",
      };
      const str = formatEntity(entity);
      assert.ok(str.includes("current=20.5"));
      assert.ok(str.includes("target=22"));
    });

    it("formats sensor with unit", () => {
      const entity: HaEntity = {
        entityId: "sensor.temperature",
        domain: "sensor",
        state: "21.3",
        friendlyName: "Temperature",
        attributes: { unit_of_measurement: "°C" },
        lastChanged: "",
      };
      const str = formatEntity(entity);
      assert.ok(str.includes("unit=°C"));
    });

    it("formats media player with source", () => {
      const entity: HaEntity = {
        entityId: "media_player.tv",
        domain: "media_player",
        state: "playing",
        friendlyName: "Living Room TV",
        attributes: { source: "Netflix" },
        lastChanged: "",
      };
      const str = formatEntity(entity);
      assert.ok(str.includes("source=Netflix"));
    });

    it("formats entity without special attributes", () => {
      const entity: HaEntity = {
        entityId: "switch.plug",
        domain: "switch",
        state: "off",
        friendlyName: "Smart Plug",
        attributes: {},
        lastChanged: "",
      };
      const str = formatEntity(entity);
      assert.equal(str, '[switch.plug] "Smart Plug" state=off');
    });
  });
});
