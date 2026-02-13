import { getCachedProfile } from "../profile/store.js";

/**
 * Extracts custom PII terms from the user profile.
 * Returns an array of strings to add to anonymizer's customTerms.
 */
export function getProfilePiiTerms(): string[] {
  const profile = getCachedProfile();
  if (!profile) return [];

  const terms: string[] = [];

  // User's name (first name, full name, parts)
  if (profile.name) {
    terms.push(profile.name);
    // Also add individual name parts (e.g. "Slavko Klincov" -> "Slavko", "Klincov")
    const parts = profile.name.split(/\s+/).filter((p) => p.length >= 2);
    for (const part of parts) {
      if (!terms.includes(part)) terms.push(part);
    }
  }

  // VIP email senders (these are personal contacts)
  if (profile.emailMonitor.vipSenders.length > 0) {
    for (const sender of profile.emailMonitor.vipSenders) {
      terms.push(sender);
    }
  }

  return terms;
}
