import type { TranslationKey } from "../keys.js";

export const en: Record<TranslationKey, string> = {
  // Bot commands
  "bot.trackUsage": "Usage: /track <tracking number>",
  "bot.alreadyTracked": "Shipment {trackingNumber} is already being tracked.",
  "bot.trackingStarted": "{emoji} Tracking started: {trackingNumber}\nType: {type}\nCarrier: {carrier}",
  "bot.unknownCarrier": "Unknown",
  "bot.notFound": "Shipment {trackingNumber} not found.",
  "bot.noShipments": "No shipments being tracked.",
  "bot.listHeader": "Shipments ({count}):",
  "bot.deleteUsage": "Usage: /delete <tracking number>",
  "bot.deleted": "Tracking stopped for {trackingNumber}.",
  "bot.mapLink": "Map: {url}",
  "bot.help": "geofrey.ai — Freight Tracking\n\n/track <number> — Track a shipment\n/status [number] — Show status\n/list — All shipments\n/delete <number> — Stop tracking\n/map — Open dashboard\n/help — This help",
  "bot.unknownCommand": "Unknown command. /help for available commands.",

  // Alerts
  "alerts.delayed": "\u26a0\ufe0f Shipment {trackingNumber} is delayed!",
  "alerts.statusChanged": "\ud83d\udce6 {trackingNumber}: {oldStatus} \u2192 {newStatus}",

  // Shipment types
  "type.ocean": "Ocean",
  "type.air": "Air",
  "type.parcel": "Parcel",
  "type.road": "Road",

  // Status
  "status.pending": "Pending",
  "status.in_transit": "In Transit",
  "status.delivered": "Delivered",
  "status.delayed": "Delayed",
  "status.exception": "Exception",
  "status.unknown": "Unknown",

  // Dashboard
  "dashboard.started": "Dashboard started on port {port}",
};
