import WebSocket from "ws";

interface AisConfig {
  apiKey: string;
}

interface PositionUpdate {
  mmsi: string;
  vesselName: string;
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  timestamp: number;
}

type OnUpdate = (update: PositionUpdate) => void;

export function createAisClient(config: AisConfig, onUpdate: OnUpdate) {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  let subscribedMmsis: Set<string> = new Set();
  let shouldConnect = false;

  function connect() {
    if (ws) return;
    shouldConnect = true;

    ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

    ws.on("open", () => {
      console.log("AIS WebSocket connected");
      reconnectDelay = 1000;
      sendSubscription();
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.MessageType === "PositionReport") {
          const pos = msg.Message?.PositionReport;
          const meta = msg.MetaData;
          if (pos && meta) {
            onUpdate({
              mmsi: String(meta.MMSI),
              vesselName: meta.ShipName?.trim() ?? "",
              lat: pos.Latitude,
              lon: pos.Longitude,
              speed: pos.Sog ?? 0,
              heading: pos.TrueHeading ?? pos.Cog ?? 0,
              timestamp: Date.now(),
            });
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      ws = null;
      if (shouldConnect) scheduleReconnect();
    });

    ws.on("error", (err) => {
      console.error("AIS WebSocket error:", err.message);
      ws?.close();
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    console.log(`AIS reconnecting in ${reconnectDelay / 1000}s...`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      connect();
    }, reconnectDelay);
  }

  function sendSubscription() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (subscribedMmsis.size === 0) return;

    ws.send(JSON.stringify({
      APIKey: config.apiKey,
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FiltersShipMMSI: Array.from(subscribedMmsis),
      FilterMessageTypes: ["PositionReport"],
    }));
  }

  function disconnect() {
    shouldConnect = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  function subscribeMmsi(mmsi: string) {
    subscribedMmsis.add(mmsi);
    sendSubscription();
  }

  function unsubscribeMmsi(mmsi: string) {
    subscribedMmsis.delete(mmsi);
    sendSubscription();
  }

  return { connect, disconnect, subscribeMmsi, unsubscribeMmsi };
}

export type AisClient = ReturnType<typeof createAisClient>;
