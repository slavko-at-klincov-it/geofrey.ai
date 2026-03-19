export type ShipmentType = "ocean" | "air" | "parcel" | "road";

export type ShipmentStatus = "pending" | "in_transit" | "delivered" | "delayed" | "exception" | "unknown";

export interface Shipment {
  id: string;
  trackingNumber: string;
  type: ShipmentType;
  carrier: string | null;
  status: ShipmentStatus;
  origin: string | null;
  destination: string | null;
  eta: number | null;
  currentLat: number | null;
  currentLon: number | null;
  metadata: string | null;
  chatId: string;
  createdAt: number;
  updatedAt: number;
}

export interface ShipmentEvent {
  id: string;
  shipmentId: string;
  eventType: string;
  description: string | null;
  location: string | null;
  lat: number | null;
  lon: number | null;
  timestamp: number;
  createdAt: number;
}

export interface VesselPosition {
  mmsi: string;
  vesselName: string | null;
  lat: number;
  lon: number;
  speed: number | null;
  heading: number | null;
  updatedAt: number;
}
