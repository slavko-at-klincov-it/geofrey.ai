/**
 * Network device discovery via SSDP (UPnP) and mDNS.
 * Pure Node.js — no external dependencies.
 */

import { createSocket, type Socket } from "node:dgram";

export interface DiscoveredDevice {
  name: string;
  type: "hue" | "sonos" | "homeassistant" | "unknown";
  ip: string;
  port: number;
}

const SSDP_MULTICAST_ADDR = "239.255.255.250";
const SSDP_PORT = 1900;
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Build an SSDP M-SEARCH request for the given search target.
 */
function buildMSearchRequest(searchTarget: string): string {
  return [
    "M-SEARCH * HTTP/1.1",
    `HOST: ${SSDP_MULTICAST_ADDR}:${SSDP_PORT}`,
    `MAN: "ssdp:discover"`,
    "MX: 3",
    `ST: ${searchTarget}`,
    "",
    "",
  ].join("\r\n");
}

/**
 * Parse SSDP response headers into a key-value map (lowercase keys).
 */
function parseSsdpResponse(msg: string): Map<string, string> {
  const headers = new Map<string, string>();
  const lines = msg.split("\r\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      headers.set(key, value);
    }
  }
  return headers;
}

/**
 * Extract IP and port from a URL string (e.g., LOCATION header).
 */
function extractIpPort(urlStr: string): { ip: string; port: number } | undefined {
  try {
    const url = new URL(urlStr);
    return {
      ip: url.hostname,
      port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
    };
  } catch {
    return undefined;
  }
}

/**
 * Detect device type from SSDP response headers.
 */
function detectDeviceType(headers: Map<string, string>): { type: DiscoveredDevice["type"]; name: string } {
  const server = headers.get("server") ?? "";
  const st = headers.get("st") ?? "";
  const usn = headers.get("usn") ?? "";
  const location = headers.get("location") ?? "";

  // Philips Hue bridge
  if (
    server.toLowerCase().includes("hue") ||
    usn.toLowerCase().includes("hue") ||
    location.includes("/description.xml") && server.includes("IpBridge")
  ) {
    return { type: "hue", name: "Philips Hue Bridge" };
  }

  // Sonos speakers
  if (
    server.toLowerCase().includes("sonos") ||
    st.includes("Sonos") ||
    usn.toLowerCase().includes("sonos")
  ) {
    return { type: "sonos", name: "Sonos Speaker" };
  }

  // HomeAssistant
  if (
    server.toLowerCase().includes("homeassistant") ||
    location.includes(":8123")
  ) {
    return { type: "homeassistant", name: "Home Assistant" };
  }

  return { type: "unknown", name: server || "Unknown Device" };
}

/**
 * Scan the local network for devices via SSDP M-SEARCH.
 * Searches for UPnP root devices and Sonos-specific targets.
 *
 * @param timeoutMs - Scan duration in milliseconds (default 5000)
 * @returns Array of discovered devices (deduplicated by IP)
 */
export async function discoverSsdp(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<DiscoveredDevice[]> {
  const devices = new Map<string, DiscoveredDevice>();

  const searchTargets = [
    "ssdp:all",
    "urn:schemas-upnp-org:device:ZonePlayer:1", // Sonos
    "upnp:rootdevice",
  ];

  return new Promise((resolve) => {
    let socket: Socket;
    try {
      socket = createSocket({ type: "udp4", reuseAddr: true });
    } catch {
      resolve([]);
      return;
    }

    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {
        // Socket may already be closed
      }
      resolve(Array.from(devices.values()));
    }, timeoutMs);

    socket.on("error", () => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Ignore
      }
      resolve(Array.from(devices.values()));
    });

    socket.on("message", (msg) => {
      const text = msg.toString("utf-8");
      const headers = parseSsdpResponse(text);
      const location = headers.get("location");
      if (!location) return;

      const addr = extractIpPort(location);
      if (!addr) return;

      const key = `${addr.ip}:${addr.port}`;
      if (devices.has(key)) return;

      const { type, name } = detectDeviceType(headers);
      devices.set(key, { name, type, ip: addr.ip, port: addr.port });
    });

    socket.bind(() => {
      for (const st of searchTargets) {
        const request = buildMSearchRequest(st);
        const buf = Buffer.from(request, "utf-8");
        socket.send(buf, 0, buf.length, SSDP_PORT, SSDP_MULTICAST_ADDR, () => {
          // Send errors are non-fatal
        });
      }
    });
  });
}

/**
 * Discover Philips Hue bridges via the cloud discovery endpoint.
 * Falls back gracefully on network errors.
 */
export async function discoverHueCloud(): Promise<DiscoveredDevice[]> {
  try {
    const res = await fetch("https://discovery.meethue.com/", {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const data = await res.json() as Array<{ id?: string; internalipaddress?: string; port?: number }>;
    if (!Array.isArray(data)) return [];

    return data
      .filter((entry) => entry.internalipaddress)
      .map((entry) => ({
        name: `Hue Bridge (${entry.id ?? "unknown"})`,
        type: "hue" as const,
        ip: entry.internalipaddress!,
        port: entry.port ?? 443,
      }));
  } catch {
    return [];
  }
}

/**
 * Run all discovery methods in parallel and merge results.
 * Deduplicates by IP address, preferring more specific device types.
 */
export async function discoverAll(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<DiscoveredDevice[]> {
  const [ssdpDevices, hueDevices] = await Promise.all([
    discoverSsdp(timeoutMs),
    discoverHueCloud(),
  ]);

  const merged = new Map<string, DiscoveredDevice>();

  // SSDP results first (lower priority)
  for (const device of ssdpDevices) {
    merged.set(device.ip, device);
  }

  // Cloud results override (higher specificity)
  for (const device of hueDevices) {
    merged.set(device.ip, device);
  }

  return Array.from(merged.values());
}
