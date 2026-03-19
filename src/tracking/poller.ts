import type { Config } from "../config/schema.js";
import type { ShipmentManager } from "../shipments/manager.js";
import { fetchDhlTracking } from "./dhl.js";
import { fetchFlightPosition } from "./opensky.js";
import { checkDelayAlert, checkStatusChangeAlert } from "../alerts/alerts.js";
import type { ShipmentStatus } from "../shipments/types.js";

interface Alert {
  type: string;
  shipmentId: string;
  chatId: string;
  message: string;
}

type OnAlert = (alert: Alert) => void;

export function createPoller(config: Config, manager: ShipmentManager, onAlert: OnAlert) {
  let flightTimer: ReturnType<typeof setInterval> | null = null;
  let parcelTimer: ReturnType<typeof setInterval> | null = null;

  async function pollFlights() {
    if (!config.opensky.enabled) return;
    const active = manager.listAllActive().filter((s) => s.type === "air");
    for (const shipment of active) {
      try {
        const pos = await fetchFlightPosition(
          { user: config.opensky.user, pass: config.opensky.pass },
          shipment.trackingNumber,
        );
        if (pos && pos.lat !== 0 && pos.lon !== 0) {
          manager.updatePosition(shipment.id, pos.lat, pos.lon);
          if (pos.onGround) {
            const oldStatus = shipment.status as ShipmentStatus;
            manager.updateStatus(shipment.id, "delivered", "Aircraft landed");
            const alert = checkStatusChangeAlert(
              { ...shipment, status: "delivered" },
              oldStatus,
              "delivered",
            );
            if (alert) onAlert(alert);
          }
        }
      } catch (err) {
        console.error(`OpenSky poll failed for ${shipment.trackingNumber}:`, err);
      }
    }
  }

  async function pollParcels() {
    if (!config.dhl.enabled || !config.dhl.apiKey) return;
    const active = manager.listAllActive().filter((s) => s.type === "parcel");
    for (const shipment of active) {
      try {
        const result = await fetchDhlTracking(
          { apiKey: config.dhl.apiKey! },
          shipment.trackingNumber,
        );
        if (!result) continue;

        const oldStatus = shipment.status as ShipmentStatus;
        if (result.status !== oldStatus) {
          manager.updateStatus(shipment.id, result.status);
          const alert = checkStatusChangeAlert(
            { ...shipment, status: result.status },
            oldStatus,
            result.status,
          );
          if (alert) onAlert(alert);
        }

        if (result.estimatedDelivery) {
          const updated = manager.getShipment(shipment.id);
          if (updated) {
            const delayAlert = checkDelayAlert({ ...updated, eta: result.estimatedDelivery });
            if (delayAlert) onAlert(delayAlert);
          }
        }

        // Add new events
        for (const event of result.events) {
          manager.addEvent(shipment.id, {
            eventType: event.statusCode || "update",
            description: event.description,
            location: event.location,
            timestamp: new Date(event.timestamp).getTime(),
          });
        }
      } catch (err) {
        console.error(`DHL poll failed for ${shipment.trackingNumber}:`, err);
      }
    }
  }

  function start() {
    if (config.opensky.enabled) {
      flightTimer = setInterval(pollFlights, config.opensky.pollIntervalMs);
      console.log(`Poller: flights every ${config.opensky.pollIntervalMs / 1000}s`);
      pollFlights(); // Initial poll
    }
    if (config.dhl.enabled) {
      parcelTimer = setInterval(pollParcels, config.dhl.pollIntervalMs);
      console.log(`Poller: parcels every ${config.dhl.pollIntervalMs / 1000}s`);
      pollParcels(); // Initial poll
    }
  }

  function stop() {
    if (flightTimer) { clearInterval(flightTimer); flightTimer = null; }
    if (parcelTimer) { clearInterval(parcelTimer); parcelTimer = null; }
  }

  return { start, stop };
}

export type Poller = ReturnType<typeof createPoller>;
