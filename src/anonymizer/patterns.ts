/**
 * Deterministic regex patterns for detecting sensitive data in prompts.
 * Each pattern returns a category used for placeholder naming.
 */

export type AnonCategory =
  | "secret"
  | "email"
  | "ip"
  | "path"
  | "connection_string"
  | "custom"
  | "llm_detected";

export interface PatternMatch {
  category: AnonCategory;
  value: string;
  start: number;
  end: number;
}

// API keys and tokens — common prefixes
const SECRET_PATTERN =
  /\b(sk-[a-zA-Z0-9_-]{20,}|sk-ant-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{36,}|gho_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{22,}|glpat-[a-zA-Z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[bsap]-[a-zA-Z0-9-]{10,}|Bearer\s+[a-zA-Z0-9._~+/=-]{20,})\b/g;

// Standard email pattern
const EMAIL_PATTERN =
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

// IPv4 (not localhost/loopback)
const IPV4_PATTERN =
  /\b(?!127\.0\.0\.|0\.0\.0\.|localhost)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;

// IPv6 (not ::1 loopback)
const IPV6_PATTERN =
  /\b(?!::1\b)([0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){7}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4})\b/g;

// Database connection strings
const CONN_STRING_PATTERN =
  /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s'"`)]+/gi;

// Home directory paths — only match /Users/<name>/ or /home/<name>/
const HOME_PATH_PATTERN =
  /(?:\/Users\/|\/home\/)[a-zA-Z0-9._-]+/g;

interface PatternDef {
  category: AnonCategory;
  pattern: RegExp;
}

const PATTERNS: PatternDef[] = [
  { category: "secret", pattern: SECRET_PATTERN },
  { category: "connection_string", pattern: CONN_STRING_PATTERN },
  { category: "email", pattern: EMAIL_PATTERN },
  { category: "ip", pattern: IPV4_PATTERN },
  { category: "ip", pattern: IPV6_PATTERN },
  { category: "path", pattern: HOME_PATH_PATTERN },
];

/**
 * Scan text for sensitive patterns. Returns non-overlapping matches
 * sorted by start position, preferring longer matches.
 */
export function detectPatterns(
  text: string,
  skipCategories: Set<string> = new Set(),
): PatternMatch[] {
  const matches: PatternMatch[] = [];

  for (const { category, pattern } of PATTERNS) {
    if (skipCategories.has(category)) continue;

    // Reset lastIndex for global regexes
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        category,
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  // Sort by start position, then prefer longer matches
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Remove overlapping matches (keep the first/longest)
  const filtered: PatternMatch[] = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      filtered.push(match);
      lastEnd = match.end;
    }
  }

  return filtered;
}

/**
 * Detect custom terms (exact match, case-insensitive).
 */
export function detectCustomTerms(
  text: string,
  terms: string[],
): PatternMatch[] {
  const matches: PatternMatch[] = [];

  for (const term of terms) {
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        category: "custom",
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}
