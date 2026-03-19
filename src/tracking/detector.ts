import type { ShipmentType } from "../shipments/types.js";

interface DetectionResult {
  type: ShipmentType;
  format: string;
}

// ISO 6346 container number: 4 letters + 7 digits
const CONTAINER_RE = /^[A-Z]{4}\d{7}$/;
// MMSI: starts with 2-7, 9 digits total
const MMSI_RE = /^[2-7]\d{8}$/;
// Air waybill: 3-digit prefix, dash, 8 digits
const AWB_RE = /^\d{3}-\d{8}$/;
// Flight callsign: 2-3 letters + 1-4 digits
const FLIGHT_RE = /^[A-Z]{2,3}\d{1,4}$/;
// ICAO24 hex transponder code: exactly 6 hex chars
const ICAO24_RE = /^[0-9A-Fa-f]{6}$/;

export function detectTrackingType(input: string): DetectionResult | null {
  const trimmed = input.trim().toUpperCase();

  if (CONTAINER_RE.test(trimmed)) {
    return { type: "ocean", format: "container" };
  }
  if (MMSI_RE.test(trimmed)) {
    return { type: "ocean", format: "mmsi" };
  }
  if (AWB_RE.test(trimmed)) {
    return { type: "air", format: "awb" };
  }
  if (FLIGHT_RE.test(trimmed)) {
    return { type: "air", format: "flight" };
  }
  if (ICAO24_RE.test(input.trim())) {
    return { type: "air", format: "icao24" };
  }

  // Generic parcel tracking numbers (10-39 digits or alphanumeric)
  if (/^\d{10,39}$/.test(trimmed) || /^[A-Z0-9]{10,30}$/.test(trimmed)) {
    return { type: "parcel", format: "parcel" };
  }

  return null;
}

export function detectCarrier(trackingNumber: string, type: ShipmentType): string | null {
  const trimmed = trackingNumber.trim().toUpperCase();

  if (type === "parcel") {
    // DHL: starts with JJD, 00, or is 10-39 digits
    if (trimmed.startsWith("JJD") || trimmed.startsWith("00")) return "DHL";
    // UPS: starts with 1Z
    if (trimmed.startsWith("1Z")) return "UPS";
    // FedEx: 12 or 15 digit numbers
    if (/^\d{12}$/.test(trimmed) || /^\d{15}$/.test(trimmed)) return "FedEx";
    // DPD: 14 digits
    if (/^\d{14}$/.test(trimmed)) return "DPD";
    // GLS: starts with numeric, often 11-12 chars
    return "DHL"; // Default carrier for parcels
  }

  if (type === "air") {
    const prefix = trimmed.slice(0, 3);
    const carriers: Record<string, string> = {
      "020": "Lufthansa Cargo",
      "057": "Air France Cargo",
      "074": "KLM Cargo",
      "176": "Emirates SkyCargo",
      "580": "Cargolux",
    };
    if (carriers[prefix]) return carriers[prefix];
  }

  return null;
}
