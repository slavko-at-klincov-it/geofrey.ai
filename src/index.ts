import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config/defaults.js";
import { setLocale } from "./i18n/index.js";
import { getDb, closeDb } from "./db/client.js";
import { createShipmentManager } from "./shipments/manager.js";
import { createTelegramBot } from "./bot/commands.js";
import { createPoller } from "./tracking/poller.js";
import { createAisClient } from "./tracking/ais.js";
import { createDashboardServer } from "./dashboard/server.js";
import { vesselPositions } from "./db/schema.js";
import { eq } from "drizzle-orm";

async function main() {
  console.log("geofrey.ai freight tracker starting...");

  const config = loadConfig();
  setLocale(config.locale);

  // Ensure data directory exists
  await mkdir("data", { recursive: true });

  // Initialize database
  const db = getDb(config.database.url);
  const manager = createShipmentManager(db);

  // Create Telegram bot
  const telegramBot = createTelegramBot(config, manager);

  // Create dashboard server
  const dashboard = createDashboardServer(
    { port: config.dashboard.port, token: config.dashboard.token },
    manager,
    db,
  );

  // Alert handler: send Telegram message
  function handleAlert(alert: { chatId: string; message: string }) {
    telegramBot.bot.api.sendMessage(Number(alert.chatId), alert.message).catch((err) => {
      console.error("Alert send failed:", err);
    });
  }

  // Create poller for DHL + OpenSky
  const poller = createPoller(config, manager, (alert) => {
    handleAlert(alert);
    dashboard.broadcast("alert", alert);
  });

  // Create AIS WebSocket client
  let aisClient: ReturnType<typeof createAisClient> | null = null;
  if (config.ais.enabled && config.ais.apiKey) {
    aisClient = createAisClient({ apiKey: config.ais.apiKey }, (update) => {
      // Upsert vessel position
      const existing = db.select().from(vesselPositions)
        .where(eq(vesselPositions.mmsi, update.mmsi)).get();

      if (existing) {
        db.update(vesselPositions)
          .set({
            vesselName: update.vesselName,
            lat: update.lat,
            lon: update.lon,
            speed: update.speed,
            heading: update.heading,
            updatedAt: update.timestamp,
          })
          .where(eq(vesselPositions.mmsi, update.mmsi))
          .run();
      } else {
        db.insert(vesselPositions).values({
          mmsi: update.mmsi,
          vesselName: update.vesselName,
          lat: update.lat,
          lon: update.lon,
          speed: update.speed,
          heading: update.heading,
          updatedAt: update.timestamp,
        }).run();
      }

      // Update any ocean shipments tracking this MMSI
      const shipmentList = manager.listAllActive().filter(
        (s) => s.type === "ocean" && s.trackingNumber === update.mmsi,
      );
      for (const s of shipmentList) {
        manager.updatePosition(s.id, update.lat, update.lon);
      }

      dashboard.broadcast("vessel", update);
    });
    aisClient.connect();
    console.log("AIS WebSocket client started");

    // Subscribe MMSIs of active ocean shipments
    const oceanShipments = manager.listAllActive().filter((s) => s.type === "ocean");
    for (const s of oceanShipments) {
      aisClient.subscribeMmsi(s.trackingNumber);
    }
  }

  // Start poller
  poller.start();

  // Start dashboard
  if (config.dashboard.enabled) {
    await dashboard.start();
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    poller.stop();
    if (aisClient) aisClient.disconnect();
    await telegramBot.stop();
    await dashboard.stop();
    closeDb();
    console.log("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start Telegram bot (blocking — long polling)
  await telegramBot.start();
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
