/**
 * De-anonymization: restore real values from placeholders in output text.
 * Includes streaming-safe chunk processing with carry-over buffer.
 */

import type { MappingTable } from "./mapping.js";

// Matches any __ANON_*__ or __PRIV_*__ placeholder
const PLACEHOLDER_PATTERN = /__(ANON|PRIV)_[A-Z_]+_\d{3}__/g;

// Partial placeholder at end of chunk — hold for next chunk
const PARTIAL_PLACEHOLDER = /__(ANON|PRIV)(?:_[A-Z_]*(?:_\d{0,2})?)?$/;

/**
 * De-anonymize a complete string by replacing all placeholders with real values.
 */
export function deanonymize(text: string, table: MappingTable): string {
  if (table.entries.length === 0) return text;

  return text.replace(PLACEHOLDER_PATTERN, (match) => {
    return table.reverse.get(match) ?? match;
  });
}

/**
 * Streaming-safe de-anonymization state.
 * Holds a carry-over buffer for partial placeholders split across chunks.
 */
export interface DeanonymizeStream {
  /** Process a chunk, returning the de-anonymized text ready to emit. */
  push(chunk: string): string;
  /** Flush remaining buffer (call at end of stream). */
  flush(): string;
}

/**
 * Create a streaming de-anonymizer that handles chunk boundaries.
 *
 * If a chunk ends with a partial `__ANON_` or `__PRIV_`, those bytes are held
 * until the next chunk completes the placeholder.
 */
export function createDeanonymizeStream(table: MappingTable): DeanonymizeStream {
  let buffer = "";

  return {
    push(chunk: string): string {
      buffer += chunk;

      // Check if buffer ends with a partial placeholder
      const partialMatch = PARTIAL_PLACEHOLDER.exec(buffer);
      if (partialMatch) {
        // Hold the partial match, emit everything before it
        const safeEnd = partialMatch.index;
        const safe = buffer.slice(0, safeEnd);
        buffer = buffer.slice(safeEnd);
        return deanonymize(safe, table);
      }

      // No partial — emit everything
      const result = deanonymize(buffer, table);
      buffer = "";
      return result;
    },

    flush(): string {
      if (!buffer) return "";
      const result = deanonymize(buffer, table);
      buffer = "";
      return result;
    },
  };
}
