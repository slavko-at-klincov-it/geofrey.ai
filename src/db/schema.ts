import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const shipments = sqliteTable("shipments", {
  id: text("id").primaryKey(),
  trackingNumber: text("tracking_number").notNull(),
  type: text("type", { enum: ["ocean", "air", "parcel", "road"] }).notNull(),
  carrier: text("carrier"),
  status: text("status", {
    enum: ["pending", "in_transit", "delivered", "delayed", "exception", "unknown"],
  }).notNull().default("pending"),
  origin: text("origin"),
  destination: text("destination"),
  eta: integer("eta"),
  currentLat: real("current_lat"),
  currentLon: real("current_lon"),
  metadata: text("metadata"), // JSON
  chatId: text("chat_id").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const shipmentEvents = sqliteTable("shipment_events", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id").notNull().references(() => shipments.id),
  eventType: text("event_type").notNull(),
  description: text("description"),
  location: text("location"),
  lat: real("lat"),
  lon: real("lon"),
  timestamp: integer("timestamp").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const vesselPositions = sqliteTable("vessel_positions", {
  mmsi: text("mmsi").primaryKey(),
  vesselName: text("vessel_name"),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  speed: real("speed"),
  heading: real("heading"),
  updatedAt: integer("updated_at").notNull(),
});
