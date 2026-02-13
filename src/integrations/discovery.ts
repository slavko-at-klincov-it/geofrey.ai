import { createSocket } from "node:dgram";

export interface DiscoveredDevice {
  ip: string;
  port: number;
  server: string;
}

const SSDP_MULTICAST = "239.255.255.250";
const SSDP_PORT = 1900;

/**
 * Discover devices via SSDP (Simple Service Discovery Protocol).
 */
export async function discoverSsdp(
  searchTarget: string,
  timeoutMs = 5000,
): Promise<DiscoveredDevice[]> {
  return new Promise<DiscoveredDevice[]>((resolve) => {
    const devices: DiscoveredDevice[] = [];
    const seen = new Set<string>();

    const socket = createSocket({ type: "udp4", reuseAddr: true });

    const message = Buffer.from(
      `M-SEARCH * HTTP/1.1\r\n` +
      `HOST: ${SSDP_MULTICAST}:${SSDP_PORT}\r\n` +
      `MAN: "ssdp:discover"\r\n` +
      `MX: ${Math.ceil(timeoutMs / 1000)}\r\n` +
      `ST: ${searchTarget}\r\n` +
      `\r\n`,
    );

    socket.on("message", (msg, rinfo) => {
      const text = msg.toString();
      const key = `${rinfo.address}:${rinfo.port}`;
      if (seen.has(key)) return;
      seen.add(key);

      const serverMatch = /SERVER:\s*(.+)/i.exec(text);
      devices.push({
        ip: rinfo.address,
        port: rinfo.port,
        server: serverMatch?.[1]?.trim() ?? "unknown",
      });
    });

    socket.on("error", () => {
      socket.close();
      resolve(devices);
    });

    socket.bind(() => {
      socket.addMembership(SSDP_MULTICAST);
      socket.send(message, 0, message.length, SSDP_PORT, SSDP_MULTICAST);
    });

    setTimeout(() => {
      socket.close();
      resolve(devices);
    }, timeoutMs);
  });
}

/**
 * Discover Hue bridge via meethue.com/api/nupnp (fallback).
 */
export async function discoverHueBridgeNupnp(): Promise<string | null> {
  try {
    const res = await fetch("https://discovery.meethue.com", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = await res.json() as Array<{ internalipaddress?: string }>;
    return data[0]?.internalipaddress ?? null;
  } catch {
    return null;
  }
}

/**
 * Discover Hue bridge: try SSDP first, then meethue.com fallback.
 */
export async function discoverHueBridge(): Promise<string | null> {
  const ssdpDevices = await discoverSsdp("ssdp:all", 3000);
  const hueDevice = ssdpDevices.find(
    (d) => d.server.toLowerCase().includes("hue") || d.server.toLowerCase().includes("philips"),
  );
  if (hueDevice) return hueDevice.ip;

  return discoverHueBridgeNupnp();
}

export interface DiscoveryResults {
  hue: string | null;
  sonos: string[];
}

/**
 * Aggregate discovery results.
 */
export async function discoverAll(): Promise<DiscoveryResults> {
  const [hue, ssdpDevices] = await Promise.all([
    discoverHueBridge(),
    discoverSsdp("urn:schemas-upnp-org:device:ZonePlayer:1", 3000),
  ]);

  return {
    hue,
    sonos: ssdpDevices
      .filter((d) => d.server.toLowerCase().includes("sonos"))
      .map((d) => d.ip),
  };
}
