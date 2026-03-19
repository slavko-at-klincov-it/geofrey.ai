import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { shipments, shipmentEvents } from "../db/schema.js";
import { detectTrackingType, detectCarrier } from "../tracking/detector.js";
import type { ShipmentType, ShipmentStatus } from "./types.js";

type Db = Parameters<typeof shipments._.columns.id.mapFromDriverValue> extends never[]
  ? never
  : ReturnType<typeof import("../db/client.js").getDb>;

export function createShipmentManager(db: ReturnType<typeof import("../db/client.js").getDb>) {
  return {
    createShipment(trackingNumber: string, chatId: string, typeOverride?: ShipmentType) {
      const detected = detectTrackingType(trackingNumber);
      const type = typeOverride ?? detected?.type ?? "parcel";
      const carrier = detectCarrier(trackingNumber, type);
      const now = Date.now();
      const id = randomUUID();

      db.insert(shipments).values({
        id,
        trackingNumber,
        type,
        carrier,
        status: "pending",
        chatId,
        createdAt: now,
        updatedAt: now,
      }).run();

      this.addEvent(id, {
        eventType: "created",
        description: `Tracking started for ${trackingNumber}`,
        timestamp: now,
      });

      return { id, type, carrier };
    },

    updatePosition(id: string, lat: number, lon: number) {
      const now = Date.now();
      db.update(shipments)
        .set({ currentLat: lat, currentLon: lon, updatedAt: now })
        .where(eq(shipments.id, id))
        .run();

      this.addEvent(id, {
        eventType: "position_update",
        lat,
        lon,
        timestamp: now,
      });
    },

    updateStatus(id: string, status: ShipmentStatus, description?: string) {
      const now = Date.now();
      db.update(shipments)
        .set({ status, updatedAt: now })
        .where(eq(shipments.id, id))
        .run();

      this.addEvent(id, {
        eventType: "status_change",
        description: description ?? `Status changed to ${status}`,
        timestamp: now,
      });
    },

    addEvent(shipmentId: string, event: {
      eventType: string;
      description?: string;
      location?: string;
      lat?: number;
      lon?: number;
      timestamp: number;
    }) {
      db.insert(shipmentEvents).values({
        id: randomUUID(),
        shipmentId,
        eventType: event.eventType,
        description: event.description ?? null,
        location: event.location ?? null,
        lat: event.lat ?? null,
        lon: event.lon ?? null,
        timestamp: event.timestamp,
        createdAt: Date.now(),
      }).run();
    },

    getShipment(id: string) {
      return db.select().from(shipments).where(eq(shipments.id, id)).get() ?? null;
    },

    getByTrackingNumber(trackingNumber: string, chatId: string) {
      return db.select().from(shipments)
        .where(and(eq(shipments.trackingNumber, trackingNumber), eq(shipments.chatId, chatId)))
        .get() ?? null;
    },

    listShipments(chatId: string) {
      return db.select().from(shipments).where(eq(shipments.chatId, chatId)).all();
    },

    listAllActive() {
      return db.select().from(shipments)
        .where(
          eq(shipments.status, "pending"),
        ).all()
        .concat(
          db.select().from(shipments).where(eq(shipments.status, "in_transit")).all(),
        );
    },

    getEvents(shipmentId: string) {
      return db.select().from(shipmentEvents)
        .where(eq(shipmentEvents.shipmentId, shipmentId))
        .all();
    },

    deleteShipment(id: string) {
      db.delete(shipmentEvents).where(eq(shipmentEvents.shipmentId, id)).run();
      db.delete(shipments).where(eq(shipments.id, id)).run();
    },
  };
}

export type ShipmentManager = ReturnType<typeof createShipmentManager>;
