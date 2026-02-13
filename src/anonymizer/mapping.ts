/**
 * Session-scoped reversible mapping between real values and anonymized placeholders.
 * Placeholders are structured tokens: __ANON_<CATEGORY>_<NNN>__
 */

import type { AnonCategory } from "./patterns.js";

export interface MappingEntry {
  placeholder: string;
  realValue: string;
  category: AnonCategory;
}

export interface MappingTable {
  entries: MappingEntry[];
  /** Real value → placeholder (for anonymization) */
  forward: Map<string, string>;
  /** Placeholder → real value (for de-anonymization) */
  reverse: Map<string, string>;
}

const DEFAULT_PREFIX = "__ANON_";
const DEFAULT_SUFFIX = "__";
const ALT_PREFIX = "__PRIV_";

/**
 * Detect which prefix to use — if text already contains __ANON_ placeholders,
 * use __PRIV_ to avoid collisions.
 */
function choosePrefix(text: string): string {
  return text.includes(DEFAULT_PREFIX) ? ALT_PREFIX : DEFAULT_PREFIX;
}

/**
 * Create a new mapping table from detected matches.
 * Deduplicates: same real value always maps to same placeholder.
 */
export function buildMappingTable(
  matches: Array<{ category: AnonCategory; value: string }>,
  existingText?: string,
): MappingTable {
  const prefix = existingText ? choosePrefix(existingText) : DEFAULT_PREFIX;
  const forward = new Map<string, string>();
  const reverse = new Map<string, string>();
  const entries: MappingEntry[] = [];
  const counters = new Map<string, number>();

  for (const { category, value } of matches) {
    // Deduplicate: same value → same placeholder
    if (forward.has(value)) continue;

    const count = (counters.get(category) ?? 0) + 1;
    counters.set(category, count);

    const tag = category.toUpperCase();
    const placeholder = `${prefix}${tag}_${String(count).padStart(3, "0")}${DEFAULT_SUFFIX}`;

    forward.set(value, placeholder);
    reverse.set(placeholder, value);
    entries.push({ placeholder, realValue: value, category });
  }

  return { entries, forward, reverse };
}

/**
 * Apply the mapping table to anonymize text.
 * Replaces all real values with their placeholders, longest-first to avoid partial matches.
 */
export function applyAnonymization(text: string, table: MappingTable): string {
  if (table.entries.length === 0) return text;

  // Sort by real value length descending to replace longest first
  const sorted = [...table.entries].sort(
    (a, b) => b.realValue.length - a.realValue.length,
  );

  let result = text;
  for (const { realValue, placeholder } of sorted) {
    // Use split+join for exact string replacement (not regex)
    result = result.split(realValue).join(placeholder);
  }

  return result;
}
