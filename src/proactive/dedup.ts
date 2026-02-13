const reminded = new Map<string, number>();

export function wasAlreadyReminded(eventId: string): boolean {
  return reminded.has(eventId);
}

export function markReminded(eventId: string): void {
  reminded.set(eventId, Date.now());
}

export function cleanupReminders(): void {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  for (const [id, ts] of reminded) {
    if (ts < cutoff) reminded.delete(id);
  }
}

/** Visible for testing */
export function _resetReminders(): void {
  reminded.clear();
}
