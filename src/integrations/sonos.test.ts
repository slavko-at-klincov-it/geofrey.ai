import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkConnection,
  getZones,
  getRoomState,
  play,
  pause,
  stop,
  next,
  previous,
  setVolume,
  playFavorite,
  setMute,
  getFavorites,
  formatRoom,
  type SonosConfig,
  type SonosRoom,
} from "./sonos.js";

const TEST_CONFIG: SonosConfig = {
  apiUrl: "http://localhost:5005",
};

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  headers?: { get: (name: string) => string | null };
}) {
  return mock.method(globalThis, "fetch", () =>
    Promise.resolve({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: response.json ?? (() => Promise.resolve({})),
      text: response.text ?? (() => Promise.resolve("")),
      headers: response.headers ?? {
        get: (name: string) => name === "content-type" ? "application/json" : null,
      },
    }),
  );
}

describe("sonos", () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  describe("checkConnection", () => {
    it("returns true when API responds", async () => {
      mockFetch({
        json: () => Promise.resolve([]),
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
  });

  describe("getZones", () => {
    it("parses zones from API response", async () => {
      mockFetch({
        json: () => Promise.resolve([
          {
            coordinator: {
              roomName: "Living Room",
              state: {
                currentTrack: {
                  title: "Bohemian Rhapsody",
                  artist: "Queen",
                  album: "A Night at the Opera",
                  duration: 354,
                  uri: "x-sonos-spotify:spotify%3Atrack%3A...",
                },
                volume: 45,
                mute: false,
                playbackState: "PLAYING",
                playMode: { repeat: "none", shuffle: false, crossfade: false },
              },
            },
          },
          {
            coordinator: {
              roomName: "Bedroom",
              state: {
                currentTrack: null,
                volume: 20,
                mute: true,
                playbackState: "STOPPED",
                playMode: "NORMAL",
              },
            },
          },
        ]),
      });

      const zones = await getZones(TEST_CONFIG);
      assert.equal(zones.length, 2);

      assert.equal(zones[0].name, "Living Room");
      assert.equal(zones[0].state.playbackState, "PLAYING");
      assert.equal(zones[0].state.volume, 45);
      assert.equal(zones[0].state.mute, false);
      assert.ok(zones[0].state.currentTrack);
      assert.equal(zones[0].state.currentTrack!.title, "Bohemian Rhapsody");
      assert.equal(zones[0].state.currentTrack!.artist, "Queen");

      assert.equal(zones[1].name, "Bedroom");
      assert.equal(zones[1].state.playbackState, "STOPPED");
      assert.equal(zones[1].state.mute, true);
      assert.equal(zones[1].state.currentTrack, null);
    });

    it("returns empty array for invalid response", async () => {
      mockFetch({
        json: () => Promise.resolve("not an array"),
      });

      const zones = await getZones(TEST_CONFIG);
      assert.deepEqual(zones, []);
    });
  });

  describe("getRoomState", () => {
    it("parses room state", async () => {
      mockFetch({
        json: () => Promise.resolve({
          currentTrack: {
            title: "Test Song",
            artist: "Test Artist",
            album: "Test Album",
            duration: 180,
            uri: "test-uri",
          },
          volume: 30,
          mute: false,
          playbackState: "PAUSED_PLAYBACK",
          playMode: "NORMAL",
        }),
      });

      const state = await getRoomState(TEST_CONFIG, "Kitchen");
      assert.equal(state.volume, 30);
      assert.equal(state.playbackState, "PAUSED_PLAYBACK");
      assert.ok(state.currentTrack);
      assert.equal(state.currentTrack!.title, "Test Song");
    });

    it("throws on invalid response", async () => {
      mockFetch({
        json: () => Promise.resolve("invalid"),
      });

      await assert.rejects(
        () => getRoomState(TEST_CONFIG, "Kitchen"),
        (err: Error) => {
          assert.ok(err.message.includes("Could not parse"));
          return true;
        },
      );
    });
  });

  describe("playback controls", () => {
    it("play sends GET to /<room>/play", async () => {
      const fetchMock = mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      const result = await play(TEST_CONFIG, "Living Room");
      assert.ok(result.includes("Living Room"));
      assert.ok(result.includes("started"));

      const url = fetchMock.mock.calls[0].arguments[0] as string;
      assert.ok(url.includes("/Living%20Room/play"));
    });

    it("pause sends GET to /<room>/pause", async () => {
      const fetchMock = mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      const result = await pause(TEST_CONFIG, "Kitchen");
      assert.ok(result.includes("paused"));

      const url = fetchMock.mock.calls[0].arguments[0] as string;
      assert.ok(url.includes("/Kitchen/pause"));
    });

    it("stop sends GET to /<room>/stop", async () => {
      mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      const result = await stop(TEST_CONFIG, "Bedroom");
      assert.ok(result.includes("stopped"));
    });

    it("next sends GET to /<room>/next", async () => {
      mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      const result = await next(TEST_CONFIG, "Office");
      assert.ok(result.includes("next track"));
    });

    it("previous sends GET to /<room>/previous", async () => {
      mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      const result = await previous(TEST_CONFIG, "Office");
      assert.ok(result.includes("previous track"));
    });
  });

  describe("setVolume", () => {
    it("sends volume level clamped to 0-100", async () => {
      const fetchMock = mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      const result = await setVolume(TEST_CONFIG, "Room", 150);
      assert.ok(result.includes("100"));

      const url = fetchMock.mock.calls[0].arguments[0] as string;
      assert.ok(url.includes("/Room/volume/100"));
    });

    it("clamps negative volume to 0", async () => {
      const fetchMock = mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      await setVolume(TEST_CONFIG, "Room", -10);

      const url = fetchMock.mock.calls[0].arguments[0] as string;
      assert.ok(url.includes("/Room/volume/0"));
    });

    it("rounds fractional volume", async () => {
      const fetchMock = mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      await setVolume(TEST_CONFIG, "Room", 33.7);

      const url = fetchMock.mock.calls[0].arguments[0] as string;
      assert.ok(url.includes("/Room/volume/34"));
    });
  });

  describe("playFavorite", () => {
    it("sends encoded favorite name", async () => {
      const fetchMock = mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      const result = await playFavorite(TEST_CONFIG, "Living Room", "Chill Hits");
      assert.ok(result.includes("Chill Hits"));

      const url = fetchMock.mock.calls[0].arguments[0] as string;
      assert.ok(url.includes("/Living%20Room/favorite/Chill%20Hits"));
    });
  });

  describe("setMute", () => {
    it("sends mute command", async () => {
      const fetchMock = mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      const result = await setMute(TEST_CONFIG, "Room", true);
      assert.ok(result.includes("muted"));

      const url = fetchMock.mock.calls[0].arguments[0] as string;
      assert.ok(url.includes("/Room/mute"));
    });

    it("sends unmute command", async () => {
      const fetchMock = mockFetch({
        text: () => Promise.resolve("OK"),
        headers: { get: () => "text/plain" },
      });

      const result = await setMute(TEST_CONFIG, "Room", false);
      assert.ok(result.includes("unmuted"));

      const url = fetchMock.mock.calls[0].arguments[0] as string;
      assert.ok(url.includes("/Room/unmute"));
    });
  });

  describe("getFavorites", () => {
    it("parses favorite titles from array response", async () => {
      mockFetch({
        json: () => Promise.resolve([
          { title: "Chill Hits" },
          { title: "Morning Jazz" },
        ]),
      });

      const favorites = await getFavorites(TEST_CONFIG);
      assert.deepEqual(favorites, ["Chill Hits", "Morning Jazz"]);
    });

    it("returns empty array for non-array response", async () => {
      mockFetch({
        json: () => Promise.resolve({}),
      });

      const favorites = await getFavorites(TEST_CONFIG);
      assert.deepEqual(favorites, []);
    });

    it("filters entries without title", async () => {
      mockFetch({
        json: () => Promise.resolve([
          { title: "Valid" },
          { name: "no-title-field" },
          { title: 123 },
        ]),
      });

      const favorites = await getFavorites(TEST_CONFIG);
      assert.deepEqual(favorites, ["Valid"]);
    });
  });

  describe("formatRoom", () => {
    it("formats playing room with track info", () => {
      const room: SonosRoom = {
        name: "Living Room",
        state: {
          currentTrack: { title: "Song", artist: "Artist", album: "Album", duration: 200, uri: "" },
          volume: 45,
          mute: false,
          playbackState: "PLAYING",
          playMode: "NORMAL",
        },
      };
      const str = formatRoom(room);
      assert.ok(str.includes("Living Room"));
      assert.ok(str.includes("PLAYING"));
      assert.ok(str.includes("vol=45"));
      assert.ok(str.includes("Artist — Song"));
    });

    it("formats muted stopped room", () => {
      const room: SonosRoom = {
        name: "Bedroom",
        state: {
          currentTrack: null,
          volume: 20,
          mute: true,
          playbackState: "STOPPED",
          playMode: "NORMAL",
        },
      };
      const str = formatRoom(room);
      assert.ok(str.includes("[MUTED]"));
      assert.ok(str.includes("STOPPED"));
    });
  });
});
