interface OpenSkyConfig {
  user?: string;
  pass?: string;
}

interface FlightPosition {
  icao24: string;
  callsign: string;
  lat: number;
  lon: number;
  altitude: number;
  velocity: number;
  heading: number;
  onGround: boolean;
}

export async function fetchFlightPosition(
  config: OpenSkyConfig,
  icao24: string,
): Promise<FlightPosition | null> {
  const url = `https://opensky-network.org/api/states/all?icao24=${icao24.toLowerCase()}`;
  const headers: Record<string, string> = {};

  if (config.user && config.pass) {
    headers["Authorization"] = `Basic ${Buffer.from(`${config.user}:${config.pass}`).toString("base64")}`;
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;

  const data = await res.json() as { states: unknown[][] | null };
  if (!data.states || data.states.length === 0) return null;

  const s = data.states[0];
  return {
    icao24: String(s[0]),
    callsign: String(s[1] ?? "").trim(),
    lat: Number(s[6]) || 0,
    lon: Number(s[5]) || 0,
    altitude: Number(s[7]) || 0,
    velocity: Number(s[9]) || 0,
    heading: Number(s[10]) || 0,
    onGround: Boolean(s[8]),
  };
}

export async function fetchFlightsByCallsign(
  config: OpenSkyConfig,
  callsign: string,
): Promise<FlightPosition | null> {
  // OpenSky doesn't have a direct callsign endpoint — fetch all and filter
  // For now, this is a convenience wrapper
  const url = `https://opensky-network.org/api/states/all`;
  const headers: Record<string, string> = {};

  if (config.user && config.pass) {
    headers["Authorization"] = `Basic ${Buffer.from(`${config.user}:${config.pass}`).toString("base64")}`;
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;

  const data = await res.json() as { states: unknown[][] | null };
  if (!data.states) return null;

  const match = data.states.find((s) => String(s[1] ?? "").trim().toUpperCase() === callsign.toUpperCase());
  if (!match) return null;

  return {
    icao24: String(match[0]),
    callsign: String(match[1] ?? "").trim(),
    lat: Number(match[6]) || 0,
    lon: Number(match[5]) || 0,
    altitude: Number(match[7]) || 0,
    velocity: Number(match[9]) || 0,
    heading: Number(match[10]) || 0,
    onGround: Boolean(match[8]),
  };
}
