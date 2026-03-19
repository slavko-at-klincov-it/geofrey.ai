import type { ShipmentStatus } from "../shipments/types.js";

interface DhlConfig {
  apiKey: string;
}

interface DhlEvent {
  timestamp: string;
  location: string;
  description: string;
  statusCode: string;
}

interface DhlTrackingResult {
  trackingNumber: string;
  status: ShipmentStatus;
  events: DhlEvent[];
  estimatedDelivery: number | null;
  origin: string | null;
  destination: string | null;
}

// Map DHL status codes to our status enum
function mapDhlStatus(statusCode: string): ShipmentStatus {
  switch (statusCode) {
    case "pre-transit": return "pending";
    case "transit": return "in_transit";
    case "delivered": return "delivered";
    case "failure":
    case "unknown":
      return "exception";
    default: return "in_transit";
  }
}

export async function fetchDhlTracking(
  config: DhlConfig,
  trackingNumber: string,
): Promise<DhlTrackingResult | null> {
  const url = `https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`;

  const res = await fetch(url, {
    headers: { "DHL-API-Key": config.apiKey },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`DHL API error: ${res.status}`);
  }

  const data = await res.json() as {
    shipments?: Array<{
      id: string;
      status?: { statusCode?: string };
      estimatedTimeOfDelivery?: string;
      origin?: { address?: { addressLocality?: string } };
      destination?: { address?: { addressLocality?: string } };
      events?: Array<{
        timestamp?: string;
        location?: { address?: { addressLocality?: string } };
        description?: string;
        statusCode?: string;
      }>;
    }>;
  };

  const shipment = data.shipments?.[0];
  if (!shipment) return null;

  const events: DhlEvent[] = (shipment.events ?? []).map((e) => ({
    timestamp: e.timestamp ?? new Date().toISOString(),
    location: e.location?.address?.addressLocality ?? "",
    description: e.description ?? "",
    statusCode: e.statusCode ?? "",
  }));

  return {
    trackingNumber,
    status: mapDhlStatus(shipment.status?.statusCode ?? "unknown"),
    events,
    estimatedDelivery: shipment.estimatedTimeOfDelivery
      ? new Date(shipment.estimatedTimeOfDelivery).getTime()
      : null,
    origin: shipment.origin?.address?.addressLocality ?? null,
    destination: shipment.destination?.address?.addressLocality ?? null,
  };
}
