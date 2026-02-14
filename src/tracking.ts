let inFlightCount = 0;

export function trackInflight(delta: number): void {
  inFlightCount += delta;
}

export function getInflightCount(): number {
  return inFlightCount;
}

export async function waitForInflight(timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (inFlightCount > 0 && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (inFlightCount > 0) {
    console.warn(`${inFlightCount} in-flight operations still running at shutdown`);
  }
}
