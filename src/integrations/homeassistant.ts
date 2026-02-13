export interface HaConfig {
  url: string;
  token: string;
}

let haConfig: HaConfig | null = null;

export function setHaConfig(config: HaConfig): void {
  haConfig = config;
}

export function getHaConfig(): HaConfig | null {
  return haConfig;
}

const FETCH_TIMEOUT_MS = 10_000;

export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
}

/**
 * Get all entity states from HomeAssistant.
 */
export async function getStates(): Promise<HaState[]> {
  if (!haConfig) throw new Error("HomeAssistant not configured — call setHaConfig() first");

  const res = await fetch(`${haConfig.url}/api/states`, {
    headers: {
      Authorization: `Bearer ${haConfig.token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`HomeAssistant API returned ${res.status}`);
  return await res.json() as HaState[];
}

/**
 * Call a HomeAssistant service.
 */
export async function callService(
  domain: string,
  service: string,
  entityId: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  if (!haConfig) throw new Error("HomeAssistant not configured — call setHaConfig() first");

  const res = await fetch(`${haConfig.url}/api/services/${domain}/${service}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${haConfig.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entity_id: entityId, ...data }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  return res.ok;
}

export interface HaService {
  domain: string;
  services: string[];
}

/**
 * Get available services.
 */
export async function getServices(): Promise<HaService[]> {
  if (!haConfig) throw new Error("HomeAssistant not configured — call setHaConfig() first");

  const res = await fetch(`${haConfig.url}/api/services`, {
    headers: {
      Authorization: `Bearer ${haConfig.token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`HomeAssistant API returned ${res.status}`);

  const data = await res.json() as Array<{ domain?: string; services?: Record<string, unknown> }>;
  return data
    .filter((d) => d.domain)
    .map((d) => ({
      domain: d.domain!,
      services: Object.keys(d.services ?? {}),
    }));
}
