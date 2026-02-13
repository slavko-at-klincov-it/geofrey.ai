import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startCompanionServer, type CompanionServer } from "./ws-server.js";
import { registerDevice, clearDevices } from "./device-registry.js";
import { createPairing, clearPairings } from "./pairing.js";
import WebSocket from "ws";

describe("ws-server", () => {
  let server: CompanionServer | null = null;
  const TEST_PORT = 39_876; // Random high port to avoid conflicts

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    clearDevices();
    clearPairings();
  });

  it("starts and stops", async () => {
    server = await startCompanionServer({
      wsPort: TEST_PORT,
      pairingTtlMs: 60_000,
      heartbeatIntervalMs: 60_000,
    });
    assert.equal(server.getConnections(), 0);
    await server.stop();
    server = null;
  });

  it("accepts pairing connection", async () => {
    server = await startCompanionServer({
      wsPort: TEST_PORT,
      pairingTtlMs: 60_000,
      heartbeatIntervalMs: 60_000,
    });

    // Register device and create pairing
    registerDevice({
      id: "test-device",
      name: "Test Phone",
      platform: "ios",
      paired: true,
      createdAt: new Date(),
    });
    const code = createPairing("test-device");

    // Connect and pair
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    const responsePromise = new Promise<{ type: string; success: boolean }>((resolve) => {
      ws.on("message", (data) => {
        resolve(JSON.parse(String(data)));
      });
    });

    ws.send(JSON.stringify({ type: "pair", code }));
    const response = await responsePromise;
    assert.equal(response.type, "pair_response");
    assert.equal(response.success, true);

    ws.close();
  });

  it("rejects invalid pairing code", async () => {
    server = await startCompanionServer({
      wsPort: TEST_PORT,
      pairingTtlMs: 60_000,
      heartbeatIntervalMs: 60_000,
    });

    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    const responsePromise = new Promise<{ type: string; success: boolean }>((resolve) => {
      ws.on("message", (data) => {
        resolve(JSON.parse(String(data)));
      });
    });

    ws.send(JSON.stringify({ type: "pair", code: "000000" }));
    const response = await responsePromise;
    assert.equal(response.success, false);
  });

  it("broadcasts to connected clients", async () => {
    server = await startCompanionServer({
      wsPort: TEST_PORT,
      pairingTtlMs: 60_000,
      heartbeatIntervalMs: 60_000,
    });

    registerDevice({ id: "d1", name: "Phone", platform: "ios", paired: true, createdAt: new Date() });
    const code = createPairing("d1");

    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    // First authenticate
    const authPromise = new Promise<void>((resolve) => {
      ws.on("message", (data) => {
        const msg = JSON.parse(String(data));
        if (msg.type === "pair_response" && msg.success) resolve();
      });
    });
    ws.send(JSON.stringify({ type: "pair", code }));
    await authPromise;

    // Then test broadcast
    const broadcastPromise = new Promise<{ type: string; text: string }>((resolve) => {
      ws.on("message", (data) => {
        const msg = JSON.parse(String(data));
        if (msg.type === "notification") resolve(msg);
      });
    });

    server.broadcast({ type: "notification", text: "Hello" });
    const received = await broadcastPromise;
    assert.equal(received.text, "Hello");

    ws.close();
  });
});
