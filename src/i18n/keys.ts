export type TranslationKey =
  // bot commands
  | "bot.trackUsage"
  | "bot.alreadyTracked"
  | "bot.trackingStarted"
  | "bot.unknownCarrier"
  | "bot.notFound"
  | "bot.noShipments"
  | "bot.listHeader"
  | "bot.deleteUsage"
  | "bot.deleted"
  | "bot.mapLink"
  | "bot.help"
  | "bot.unknownCommand"

  // alerts
  | "alerts.delayed"
  | "alerts.statusChanged"

  // shipment types
  | "type.ocean"
  | "type.air"
  | "type.parcel"
  | "type.road"

  // shipment statuses
  | "status.pending"
  | "status.in_transit"
  | "status.delivered"
  | "status.delayed"
  | "status.exception"
  | "status.unknown"

  // dashboard
  | "dashboard.started";
