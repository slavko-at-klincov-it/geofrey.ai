import { t } from "../i18n/index.js";
import type { ShipmentStatus } from "../shipments/types.js";

interface AlertInput {
  id: string;
  trackingNumber: string;
  chatId: string;
  status: ShipmentStatus;
  eta: number | null;
}

interface Alert {
  type: string;
  shipmentId: string;
  chatId: string;
  message: string;
}

export function checkDelayAlert(shipment: AlertInput): Alert | null {
  if (!shipment.eta) return null;
  if (shipment.status === "delivered") return null;
  if (shipment.status !== "in_transit" && shipment.status !== "delayed") return null;

  if (Date.now() > shipment.eta) {
    return {
      type: "delay",
      shipmentId: shipment.id,
      chatId: shipment.chatId,
      message: t("alerts.delayed", {
        trackingNumber: shipment.trackingNumber,
      }),
    };
  }

  return null;
}

export function checkStatusChangeAlert(
  shipment: AlertInput,
  oldStatus: ShipmentStatus,
  newStatus: ShipmentStatus,
): Alert | null {
  if (oldStatus === newStatus) return null;

  return {
    type: "status_change",
    shipmentId: shipment.id,
    chatId: shipment.chatId,
    message: t("alerts.statusChanged", {
      trackingNumber: shipment.trackingNumber,
      oldStatus: t(`status.${oldStatus}` as any),
      newStatus: t(`status.${newStatus}` as any),
    }),
  };
}
