/**
 * Main anonymization pipeline.
 * Coordinates regex patterns, custom terms, optional LLM extraction,
 * and mapping table construction.
 */

import { detectPatterns, detectCustomTerms, type PatternMatch } from "./patterns.js";
import { buildMappingTable, applyAnonymization, type MappingTable } from "./mapping.js";
import { deanonymize, createDeanonymizeStream } from "./deanonymizer.js";
import { extractNamesWithLlm, type LlmExtractorConfig } from "./llm-extractor.js";

export interface AnonymizerConfig {
  enabled: boolean;
  llmPass: boolean;
  customTerms: string[];
  skipCategories: string[];
  ollama?: LlmExtractorConfig;
}

export interface AnonymizeResult {
  text: string;
  table: MappingTable;
  matchCount: number;
}

/**
 * Anonymize a prompt through the full pipeline:
 * 1. Regex patterns (secrets, emails, IPs, paths, connection strings)
 * 2. User-configured custom terms
 * 3. Optional LLM pass for name extraction
 * 4. Build mapping table, replace all
 */
export async function anonymize(
  text: string,
  config: AnonymizerConfig,
): Promise<AnonymizeResult> {
  if (!config.enabled) {
    const emptyTable = buildMappingTable([]);
    return { text, table: emptyTable, matchCount: 0 };
  }

  const skipCategories = new Set(config.skipCategories);
  const allMatches: PatternMatch[] = [];

  // Step 1: Deterministic regex patterns
  const regexMatches = detectPatterns(text, skipCategories);
  allMatches.push(...regexMatches);

  // Step 2: Custom terms
  if (config.customTerms.length > 0 && !skipCategories.has("custom")) {
    const customMatches = detectCustomTerms(text, config.customTerms);
    allMatches.push(...customMatches);
  }

  // Step 3: Optional LLM pass
  if (config.llmPass && config.ollama && !skipCategories.has("llm_detected")) {
    const names = await extractNamesWithLlm(text, config.ollama);
    for (const name of names) {
      // Add as custom matches — detectCustomTerms handles word boundaries
      const nameMatches = detectCustomTerms(text, [name]);
      for (const m of nameMatches) {
        allMatches.push({ ...m, category: "llm_detected" });
      }
    }
  }

  // Step 4: Build mapping table and apply
  const deduped = deduplicateMatches(allMatches);
  const table = buildMappingTable(deduped, text);
  const anonymized = applyAnonymization(text, table);

  return { text: anonymized, table, matchCount: table.entries.length };
}

/**
 * Wrap Claude Code stream callbacks to de-anonymize output in real-time.
 */
export function wrapStreamCallbacks(
  callbacks: {
    onText?: (text: string) => void;
    onToolUse?: (toolName: string, input: Record<string, unknown>) => void;
    onToolResult?: (toolName: string, result: string) => void;
  },
  table: MappingTable,
): typeof callbacks {
  if (table.entries.length === 0) return callbacks;

  const stream = createDeanonymizeStream(table);

  return {
    onText: callbacks.onText
      ? (text: string) => {
          const deAnon = stream.push(text);
          if (deAnon) callbacks.onText!(deAnon);
        }
      : undefined,
    onToolUse: callbacks.onToolUse,
    onToolResult: callbacks.onToolResult
      ? (toolName: string, result: string) => {
          callbacks.onToolResult!(toolName, deanonymize(result, table));
        }
      : undefined,
  };
}

/**
 * Build the system prompt appendix for Claude Code when anonymization is active.
 */
export function buildAnonymizerSystemPrompt(table: MappingTable): string | undefined {
  if (table.entries.length === 0) return undefined;
  return "Some identifiers have been anonymized with `__ANON_*__` placeholders for privacy. Treat them as valid identifiers. Do not try to resolve or modify them.";
}

/** Deduplicate matches by value, keeping the first occurrence. */
function deduplicateMatches(
  matches: PatternMatch[],
): Array<{ category: PatternMatch["category"]; value: string }> {
  const seen = new Set<string>();
  const result: Array<{ category: PatternMatch["category"]; value: string }> = [];

  for (const match of matches) {
    if (!seen.has(match.value)) {
      seen.add(match.value);
      result.push({ category: match.category, value: match.value });
    }
  }

  return result;
}
