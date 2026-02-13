import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  authenticate,
  checkConnection,
  getLights,
  controlLight,
  getScenes,
  recallScene,
  getRooms,
  formatLight,
  formatScene,
  formatRoom,
  type HueConfig,
  type HueLight,
  type HueScene,
  type HueRoom,
} from "./hue.js";

const TEST_CONFIG: HueConfig = {
  bridgeIp: "192.168.1.100",
  username: "test-user-abc123",
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

describe("hue", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  describe("authenticate", () => {
    it("returns credentials on successful registration", async () => {
      mockFetch({
        json: () => Promise.resolve([{
          success: { username: "new-user-xyz", clientkey: "key-123" },
        }]),
      });

      const result = await authenticate("192.168.1.100", "geofrey#test");
      assert.ok(typeof result === "object");
      assert.equal(result.username, "new-user-xyz");
      assert.equal(result.clientkey, "key-123");
    });

    it("returns instruction when button not pressed (error 101)", async () => {
      mockFetch({
        json: () => Promise.resolve([{
          error: { type: 101, description: "link button not pressed" },
        }]),
      });

      const result = await authenticate("192.168.1.100", "geofrey#test");
      assert.equal(typeof result, "string");
      assert.ok((result as string).includes("Press the button"));
    });

    it("returns error string on HTTP failure", async () => {
      mockFetch({ ok: false, status: 500 });

      const result = await authenticate("192.168.1.100", "geofrey#test");
      assert.equal(typeof result, "string");
      assert.ok((result as string).includes("500"));
    });

    it("returns error string on network failure", async () => {
      mock.method(globalThis, "fetch", () =>
        Promise.reject(new Error("ECONNREFUSED")),
      );

      const result = await authenticate("192.168.1.100", "geofrey#test");
      assert.equal(typeof result, "string");
      assert.ok((result as string).includes("Failed to connect"));
    });

    it("handles empty response array", async () => {
      mockFetch({
        json: () => Promise.resolve([]),
      });

      const result = await authenticate("192.168.1.100", "geofrey#test");
      assert.equal(typeof result, "string");
      assert.ok((result as string).includes("Unexpected"));
    });

    it("handles generic error from bridge", async () => {
      mockFetch({
        json: () => Promise.resolve([{
          error: { type: 7, description: "invalid value for parameter" },
        }]),
      });

      const result = await authenticate("192.168.1.100", "geofrey#test");
      assert.equal(typeof result, "string");
      assert.ok((result as string).includes("invalid value"));
    });
  });

  describe("checkConnection", () => {
    it("returns true when bridge responds", async () => {
      mockFetch({
        json: () => Promise.resolve({ data: [{ id: "bridge-1" }] }),
      });

      const ok = await checkConnection(TEST_CONFIG);
      assert.equal(ok, true);
    });

    it("returns false on error", async () => {
      mock.method(globalThis, "fetch", () =>
        Promise.reject(new Error("timeout")),
      );

      const ok = await checkConnection(TEST_CONFIG);
      assert.equal(ok, false);
    });
  });

  describe("getLights", () => {
    it("parses lights from API response", async () => {
      mockFetch({
        json: () => Promise.resolve({
          data: [
            {
              id: "light-1",
              metadata: { name: "Living Room" },
              on: { on: true },
              dimming: { brightness: 75.5 },
              color_temperature: { mirek: 250 },
              color: { xy: { x: 0.3, y: 0.4 } },
              status: "connected",
            },
            {
              id: "light-2",
              metadata: { name: "Bedroom" },
              on: { on: false },
              status: "connectivity_issue",
            },
          ],
        }),
      });

      const lights = await getLights(TEST_CONFIG);
      assert.equal(lights.length, 2);

      assert.equal(lights[0].id, "light-1");
      assert.equal(lights[0].name, "Living Room");
      assert.equal(lights[0].on, true);
      assert.equal(lights[0].brightness, 75.5);
      assert.equal(lights[0].colorTemperature, 250);
      assert.deepEqual(lights[0].colorXy, { x: 0.3, y: 0.4 });
      assert.equal(lights[0].reachable, true);

      assert.equal(lights[1].id, "light-2");
      assert.equal(lights[1].on, false);
      assert.equal(lights[1].reachable, false);
    });

    it("returns empty array for missing data", async () => {
      mockFetch({
        json: () => Promise.resolve({}),
      });

      const lights = await getLights(TEST_CONFIG);
      assert.deepEqual(lights, []);
    });

    it("skips malformed light entries", async () => {
      mockFetch({
        json: () => Promise.resolve({
          data: [
            { id: "valid", metadata: { name: "OK" }, on: { on: true } },
            "not an object",
            { missing: "id field" },
          ],
        }),
      });

      const lights = await getLights(TEST_CONFIG);
      assert.equal(lights.length, 1);
      assert.equal(lights[0].id, "valid");
    });
  });

  describe("controlLight", () => {
    it("sends on/off command", async () => {
      const fetchMock = mockFetch({});

      const result = await controlLight(TEST_CONFIG, "light-1", { on: true });
      assert.ok(result.includes("light-1"));

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call.arguments[1]!.body as string);
      assert.deepEqual(body.on, { on: true });
    });

    it("sends brightness command clamped to 0-100", async () => {
      const fetchMock = mockFetch({});

      await controlLight(TEST_CONFIG, "light-1", { brightness: 150 });

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call.arguments[1]!.body as string);
      assert.deepEqual(body.dimming, { brightness: 100 });
    });

    it("sends color temperature clamped to 153-500", async () => {
      const fetchMock = mockFetch({});

      await controlLight(TEST_CONFIG, "light-1", { colorTemperatureMirek: 50 });

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call.arguments[1]!.body as string);
      assert.deepEqual(body.color_temperature, { mirek: 153 });
    });

    it("sends color xy coordinates", async () => {
      const fetchMock = mockFetch({});

      await controlLight(TEST_CONFIG, "light-1", { colorXy: { x: 0.3, y: 0.4 } });

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call.arguments[1]!.body as string);
      assert.deepEqual(body.color, { xy: { x: 0.3, y: 0.4 } });
    });

    it("combines multiple parameters in one request", async () => {
      const fetchMock = mockFetch({});

      await controlLight(TEST_CONFIG, "light-1", { on: true, brightness: 80 });

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call.arguments[1]!.body as string);
      assert.deepEqual(body.on, { on: true });
      assert.deepEqual(body.dimming, { brightness: 80 });
    });
  });

  describe("getScenes", () => {
    it("parses scenes from API response", async () => {
      mockFetch({
        json: () => Promise.resolve({
          data: [
            { id: "scene-1", metadata: { name: "Movie Night" }, group: { rid: "room-1" } },
            { id: "scene-2", metadata: { name: "Bright" } },
          ],
        }),
      });

      const scenes = await getScenes(TEST_CONFIG);
      assert.equal(scenes.length, 2);
      assert.equal(scenes[0].id, "scene-1");
      assert.equal(scenes[0].name, "Movie Night");
      assert.equal(scenes[0].group, "room-1");
      assert.equal(scenes[1].group, null);
    });

    it("returns empty array for missing data", async () => {
      mockFetch({
        json: () => Promise.resolve({}),
      });

      const scenes = await getScenes(TEST_CONFIG);
      assert.deepEqual(scenes, []);
    });
  });

  describe("recallScene", () => {
    it("sends recall action", async () => {
      const fetchMock = mockFetch({});

      const result = await recallScene(TEST_CONFIG, "scene-1");
      assert.ok(result.includes("scene-1"));

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call.arguments[1]!.body as string);
      assert.deepEqual(body.recall, { action: "active" });
    });
  });

  describe("getRooms", () => {
    it("parses rooms and filters light children", async () => {
      mockFetch({
        json: () => Promise.resolve({
          data: [{
            id: "room-1",
            metadata: { name: "Living Room" },
            children: [
              { rid: "light-1", rtype: "light" },
              { rid: "light-2", rtype: "light" },
              { rid: "sensor-1", rtype: "temperature" },
            ],
          }],
        }),
      });

      const rooms = await getRooms(TEST_CONFIG);
      assert.equal(rooms.length, 1);
      assert.equal(rooms[0].name, "Living Room");
      assert.deepEqual(rooms[0].lightIds, ["light-1", "light-2"]);
    });
  });

  describe("formatLight", () => {
    it("formats ON light with brightness and temperature", () => {
      const light: HueLight = {
        id: "l1", name: "Desk Lamp", on: true,
        brightness: 85, colorTemperature: 300, colorXy: null, reachable: true,
      };
      const str = formatLight(light);
      assert.ok(str.includes("Desk Lamp"));
      assert.ok(str.includes("ON"));
      assert.ok(str.includes("85"));
      assert.ok(str.includes("300"));
    });

    it("formats OFF unreachable light", () => {
      const light: HueLight = {
        id: "l2", name: "Hallway", on: false,
        brightness: null, colorTemperature: null, colorXy: null, reachable: false,
      };
      const str = formatLight(light);
      assert.ok(str.includes("OFF"));
      assert.ok(str.includes("[unreachable]"));
    });
  });

  describe("formatScene", () => {
    it("formats scene with group", () => {
      const scene: HueScene = { id: "s1", name: "Chill", group: "room-1" };
      assert.ok(formatScene(scene).includes("Chill"));
      assert.ok(formatScene(scene).includes("room-1"));
    });

    it("formats scene without group", () => {
      const scene: HueScene = { id: "s1", name: "Default", group: null };
      const str = formatScene(scene);
      assert.ok(str.includes("Default"));
      assert.ok(!str.includes("group="));
    });
  });

  describe("formatRoom", () => {
    it("formats room with light count", () => {
      const room: HueRoom = { id: "r1", name: "Kitchen", lightIds: ["a", "b"] };
      const str = formatRoom(room);
      assert.ok(str.includes("Kitchen"));
      assert.ok(str.includes("lights=2"));
    });
  });
});
