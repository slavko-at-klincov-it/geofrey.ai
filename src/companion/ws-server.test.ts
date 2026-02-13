import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createCompanionWSServer,
  type CompanionCallbacks,
  type CompanionWSServer,
  type WebSocketLike,
  type WSServerEvent,
} from "./ws-server.js";
import { createPairingCode, _testClearAll as clearPairing } from "./pairing.js";
import {
  getDevice,
  listDevices,
  _testClearAll as clearDevices,
} from "./device-registry.js";

// ── Mock WebSocket ─────────────────────────────────────────────────────────

function createMockWs(): WebSocketLike & {
  sentMessages: string[];
  closeCode: number | undefined;
  closeReason: string | undefined;
  listeners: Map<string, Array<(...args: unknown[]) => void>>;
  emit(event: string, ...args: unknown[]): void;
} {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const sentMessages: string[] = [];
  let closeCode: number | undefined;
  let closeReason: string | undefined;

  return {
    readyState: 1, // OPEN
    sentMessages,
    closeCode,
    closeReason,
    listeners,

    send(data: string) {
      sentMessages.push(data);
    },

    close(code?: number, reason?: string) {
      closeCode = code;
      closeReason = reason;
      this.closeCode = code;
      this.closeReason = reason;
      this.readyState = 3; // CLOSED
      // Trigger close listeners
      const closeFns = listeners.get("close") ?? [];
      for (const fn of closeFns) fn();
    },

    on(event: string, listener: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      existing.push(listener);
      listeners.set(event, existing);
    },

    emit(event: string, ...args: unknown[]) {
      const fns = listeners.get(event) ?? [];
      for (const fn of fns) fn(...args);
    },
  };
}

function makeCallbacks(): CompanionCallbacks & {
  messages: Array<{ chatId: string; text: string }>;
  images: Array<{ chatId: string; mime: string }>;
  voices: Array<{ chatId: string; mime: string }>;
  approvals: Array<{ nonce: string; approved: boolean }>;
  locations: Array<{ chatId: string; lat: number; lon: number }>;
} {
  const messages: Array<{ chatId: string; text: string }> = [];
  const images: Array<{ chatId: string; mime: string }> = [];
  const voices: Array<{ chatId: string; mime: string }> = [];
  const approvals: Array<{ nonce: string; approved: boolean }> = [];
  const locations: Array<{ chatId: string; lat: number; lon: number }> = [];

  return {
    messages,
    images,
    voices,
    approvals,
    locations,
    async onMessage(chatId, text) { messages.push({ chatId, text }); },
    async onImageMessage(chatId, _data, mime) { images.push({ chatId, mime }); },
    async onVoiceMessage(chatId, _data, mime) { voices.push({ chatId, mime }); },
    async onApprovalResponse(nonce, approved) { approvals.push({ nonce, approved }); },
    async onLocation(chatId, lat, lon) { locations.push({ chatId, lat, lon }); },
  };
}

function parseSent(ws: ReturnType<typeof createMockWs>): WSServerEvent[] {
  return ws.sentMessages.map((m) => JSON.parse(m) as WSServerEvent);
}

describe("CompanionWSServer", () => {
  let server: CompanionWSServer;
  let cb: ReturnType<typeof makeCallbacks>;

  beforeEach(() => {
    clearPairing();
    clearDevices();
    cb = makeCallbacks();
    server = createCompanionWSServer({ callbacks: cb });
  });

  describe("pairing flow", () => {
    it("rejects connection with invalid pairing code", () => {
      const ws = createMockWs();
      server._handleNewConnection(ws);

      // Send pair event with invalid code
      ws.emit("message", JSON.stringify({
        type: "pair",
        code: "000000",
        deviceName: "Test",
        devicePlatform: "ios",
      }));

      const events = parseSent(ws);
      assert.ok(events.some((e) => e.type === "error"));
    });

    it("accepts valid pairing code and registers device", () => {
      const code = createPairingCode("telegram:owner");
      const ws = createMockWs();
      server._handleNewConnection(ws);

      ws.emit("message", JSON.stringify({
        type: "pair",
        code,
        deviceName: "My iPhone",
        devicePlatform: "ios",
        pushToken: "apns-tok",
      }));

      const events = parseSent(ws);
      const pairedEvent = events.find((e) => e.type === "paired");
      assert.ok(pairedEvent);
      assert.equal(pairedEvent.type, "paired");

      if (pairedEvent.type === "paired") {
        const device = getDevice(pairedEvent.deviceId);
        assert.ok(device);
        assert.equal(device.name, "My iPhone");
        assert.equal(device.platform, "ios");
        assert.equal(device.pushToken, "apns-tok");
      }
    });

    it("tracks connection after pairing", () => {
      const code = createPairingCode("owner");
      const ws = createMockWs();
      server._handleNewConnection(ws);

      ws.emit("message", JSON.stringify({
        type: "pair",
        code,
        deviceName: "D",
        devicePlatform: "android",
      }));

      assert.equal(server.connectedCount(), 1);
    });
  });

  describe("auth flow", () => {
    it("rejects auth with unknown device ID", () => {
      const ws = createMockWs();
      server._handleNewConnection(ws);

      ws.emit("message", JSON.stringify({
        type: "auth",
        token: "nonexistent-device-id",
      }));

      const events = parseSent(ws);
      assert.ok(events.some((e) => e.type === "error"));
    });

    it("accepts auth with known device ID", () => {
      // First pair a device
      const code = createPairingCode("owner");
      const ws1 = createMockWs();
      server._handleNewConnection(ws1);
      ws1.emit("message", JSON.stringify({
        type: "pair",
        code,
        deviceName: "D",
        devicePlatform: "ios",
      }));

      const events1 = parseSent(ws1);
      const pairedEvent = events1.find((e) => e.type === "paired");
      assert.ok(pairedEvent && pairedEvent.type === "paired");

      // Simulate disconnect + reconnect with auth
      ws1.close();
      assert.equal(server.connectedCount(), 0);

      const deviceId = pairedEvent.type === "paired" ? pairedEvent.deviceId : "";
      const ws2 = createMockWs();
      server._handleNewConnection(ws2);
      ws2.emit("message", JSON.stringify({
        type: "auth",
        token: deviceId,
      }));

      // No error event should be sent
      const events2 = parseSent(ws2);
      const errors = events2.filter((e) => e.type === "error");
      assert.equal(errors.length, 0);
      assert.equal(server.connectedCount(), 1);
    });

    it("replaces existing connection for same device", () => {
      const code = createPairingCode("owner");
      const ws1 = createMockWs();
      server._handleNewConnection(ws1);
      ws1.emit("message", JSON.stringify({
        type: "pair",
        code,
        deviceName: "D",
        devicePlatform: "ios",
      }));

      const events1 = parseSent(ws1);
      const pairedEvent = events1.find((e) => e.type === "paired");
      assert.ok(pairedEvent && pairedEvent.type === "paired");
      const deviceId = pairedEvent.type === "paired" ? pairedEvent.deviceId : "";

      assert.equal(server.connectedCount(), 1);

      // Second connection with same device (auth)
      const ws2 = createMockWs();
      server._handleNewConnection(ws2);
      ws2.emit("message", JSON.stringify({
        type: "auth",
        token: deviceId,
      }));

      // Should still be 1 connection (replaced)
      assert.equal(server.connectedCount(), 1);
    });
  });

  describe("message handling", () => {
    function pairAndConnect(): { ws: ReturnType<typeof createMockWs>; deviceId: string } {
      const code = createPairingCode("owner");
      const ws = createMockWs();
      server._handleNewConnection(ws);
      ws.emit("message", JSON.stringify({
        type: "pair",
        code,
        deviceName: "D",
        devicePlatform: "ios",
      }));
      const events = parseSent(ws);
      const pairedEvt = events.find((e) => e.type === "paired");
      const deviceId = pairedEvt && pairedEvt.type === "paired" ? pairedEvt.deviceId : "";
      return { ws, deviceId };
    }

    it("forwards text messages to callback", async () => {
      const { ws, deviceId } = pairAndConnect();
      const device = getDevice(deviceId);
      assert.ok(device);

      ws.emit("message", JSON.stringify({ type: "message", text: "Hello" }));
      await new Promise((r) => setTimeout(r, 50));

      assert.equal(cb.messages.length, 1);
      assert.equal(cb.messages[0].chatId, device.chatId);
      assert.equal(cb.messages[0].text, "Hello");
    });

    it("forwards image messages to callback", async () => {
      const { ws } = pairAndConnect();

      ws.emit("message", JSON.stringify({
        type: "image",
        data: Buffer.from("fake-image").toString("base64"),
        mime: "image/png",
      }));
      await new Promise((r) => setTimeout(r, 50));

      assert.equal(cb.images.length, 1);
      assert.equal(cb.images[0].mime, "image/png");
    });

    it("forwards voice messages to callback", async () => {
      const { ws } = pairAndConnect();

      ws.emit("message", JSON.stringify({
        type: "voice",
        data: Buffer.from("fake-audio").toString("base64"),
        mime: "audio/ogg",
      }));
      await new Promise((r) => setTimeout(r, 50));

      assert.equal(cb.voices.length, 1);
      assert.equal(cb.voices[0].mime, "audio/ogg");
    });

    it("forwards approval responses to callback", async () => {
      const { ws } = pairAndConnect();

      ws.emit("message", JSON.stringify({
        type: "approval_response",
        nonce: "abc123",
        approved: true,
      }));
      await new Promise((r) => setTimeout(r, 50));

      assert.equal(cb.approvals.length, 1);
      assert.equal(cb.approvals[0].nonce, "abc123");
      assert.equal(cb.approvals[0].approved, true);
    });

    it("forwards location to callback", async () => {
      const { ws } = pairAndConnect();

      ws.emit("message", JSON.stringify({
        type: "location",
        lat: 48.8566,
        lon: 2.3522,
      }));
      await new Promise((r) => setTimeout(r, 50));

      assert.equal(cb.locations.length, 1);
      assert.equal(cb.locations[0].lat, 48.8566);
      assert.equal(cb.locations[0].lon, 2.3522);
    });

    it("handles status heartbeat", () => {
      const { ws, deviceId } = pairAndConnect();

      ws.emit("message", JSON.stringify({
        type: "status",
        online: true,
      }));

      const device = getDevice(deviceId);
      assert.ok(device);
      assert.equal(device.online, true);
    });

    it("rejects invalid JSON", () => {
      const { ws } = pairAndConnect();
      ws.sentMessages.length = 0; // Clear previous messages

      ws.emit("message", "not-json{{{");

      const events = parseSent(ws);
      assert.ok(events.some((e) => e.type === "error" && e.message === "Invalid JSON"));
    });

    it("rejects invalid event schema", () => {
      const { ws } = pairAndConnect();
      ws.sentMessages.length = 0;

      ws.emit("message", JSON.stringify({ type: "unknown_event" }));

      const events = parseSent(ws);
      assert.ok(events.some((e) => e.type === "error"));
    });
  });

  describe("sendToDevice", () => {
    it("sends event to connected device", () => {
      const code = createPairingCode("owner");
      const ws = createMockWs();
      server._handleNewConnection(ws);
      ws.emit("message", JSON.stringify({
        type: "pair",
        code,
        deviceName: "D",
        devicePlatform: "ios",
      }));

      const events = parseSent(ws);
      const pairedEvt = events.find((e) => e.type === "paired");
      assert.ok(pairedEvt && pairedEvt.type === "paired");
      const deviceId = pairedEvt.type === "paired" ? pairedEvt.deviceId : "";

      ws.sentMessages.length = 0; // Clear
      const sent = server.sendToDevice(deviceId, {
        type: "message",
        text: "Hello from server",
        messageId: "msg-1",
      });

      assert.equal(sent, true);
      const sentEvents = parseSent(ws);
      assert.equal(sentEvents.length, 1);
      assert.equal(sentEvents[0].type, "message");
    });

    it("returns false for disconnected device", () => {
      const sent = server.sendToDevice("nonexistent", {
        type: "message",
        text: "Hello",
        messageId: "msg-1",
      });
      assert.equal(sent, false);
    });
  });

  describe("broadcastToAll", () => {
    it("sends to all connected devices", () => {
      // Pair two devices
      const code1 = createPairingCode("o1");
      const code2 = createPairingCode("o2");

      const ws1 = createMockWs();
      const ws2 = createMockWs();

      server._handleNewConnection(ws1);
      ws1.emit("message", JSON.stringify({
        type: "pair", code: code1, deviceName: "D1", devicePlatform: "ios",
      }));

      server._handleNewConnection(ws2);
      ws2.emit("message", JSON.stringify({
        type: "pair", code: code2, deviceName: "D2", devicePlatform: "android",
      }));

      assert.equal(server.connectedCount(), 2);

      ws1.sentMessages.length = 0;
      ws2.sentMessages.length = 0;

      server.broadcastToAll({
        type: "message",
        text: "Broadcast!",
        messageId: "msg-bc",
      });

      assert.equal(ws1.sentMessages.length, 1);
      assert.equal(ws2.sentMessages.length, 1);
    });
  });

  describe("connection lifecycle", () => {
    it("removes connection on close", () => {
      const code = createPairingCode("owner");
      const ws = createMockWs();
      server._handleNewConnection(ws);
      ws.emit("message", JSON.stringify({
        type: "pair", code, deviceName: "D", devicePlatform: "ios",
      }));

      assert.equal(server.connectedCount(), 1);
      ws.close();
      assert.equal(server.connectedCount(), 0);
    });

    it("rejects first message that is neither auth nor pair", () => {
      const ws = createMockWs();
      server._handleNewConnection(ws);

      ws.emit("message", JSON.stringify({
        type: "message",
        text: "Hello",
      }));

      const events = parseSent(ws);
      assert.ok(events.some((e) => e.type === "error"));
    });
  });

  describe("isDeviceConnected", () => {
    it("returns true for connected device", () => {
      const code = createPairingCode("owner");
      const ws = createMockWs();
      server._handleNewConnection(ws);
      ws.emit("message", JSON.stringify({
        type: "pair", code, deviceName: "D", devicePlatform: "ios",
      }));

      const events = parseSent(ws);
      const pairedEvt = events.find((e) => e.type === "paired");
      assert.ok(pairedEvt && pairedEvt.type === "paired");
      const deviceId = pairedEvt.type === "paired" ? pairedEvt.deviceId : "";

      assert.equal(server.isDeviceConnected(deviceId), true);
    });

    it("returns false for disconnected device", () => {
      assert.equal(server.isDeviceConnected("unknown"), false);
    });
  });
});
