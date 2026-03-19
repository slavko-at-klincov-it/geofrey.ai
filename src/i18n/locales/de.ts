import type { TranslationKey } from "../keys.js";

export const de: Record<TranslationKey, string> = {
  // Bot-Befehle
  "bot.trackUsage": "Verwendung: /track <Sendungsnummer>",
  "bot.alreadyTracked": "Sendung {trackingNumber} wird bereits verfolgt.",
  "bot.trackingStarted": "{emoji} Tracking gestartet: {trackingNumber}\nTyp: {type}\nCarrier: {carrier}",
  "bot.unknownCarrier": "Unbekannt",
  "bot.notFound": "Sendung {trackingNumber} nicht gefunden.",
  "bot.noShipments": "Keine Sendungen werden verfolgt.",
  "bot.listHeader": "Sendungen ({count}):",
  "bot.deleteUsage": "Verwendung: /delete <Sendungsnummer>",
  "bot.deleted": "Tracking für {trackingNumber} gestoppt.",
  "bot.mapLink": "Karte: {url}",
  "bot.help": "geofrey.ai — Freight Tracking\n\n/track <Nummer> — Sendung verfolgen\n/status [Nummer] — Status anzeigen\n/list — Alle Sendungen\n/delete <Nummer> — Tracking stoppen\n/map — Dashboard öffnen\n/help — Diese Hilfe",
  "bot.unknownCommand": "Unbekannter Befehl. /help für verfügbare Befehle.",

  // Alerts
  "alerts.delayed": "\u26a0\ufe0f Sendung {trackingNumber} ist verspätet!",
  "alerts.statusChanged": "\ud83d\udce6 {trackingNumber}: {oldStatus} \u2192 {newStatus}",

  // Sendungstypen
  "type.ocean": "Seefracht",
  "type.air": "Luftfracht",
  "type.parcel": "Paket",
  "type.road": "LKW",

  // Status
  "status.pending": "Ausstehend",
  "status.in_transit": "Unterwegs",
  "status.delivered": "Zugestellt",
  "status.delayed": "Verspätet",
  "status.exception": "Ausnahme",
  "status.unknown": "Unbekannt",

  // Dashboard
  "dashboard.started": "Dashboard gestartet auf Port {port}",
};
