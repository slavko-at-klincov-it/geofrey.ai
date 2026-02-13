/**
 * Scans Claude Code output for leaked credentials and redacts them.
 * Defence-in-depth: even if the anonymizer misses something upstream,
 * this filter catches secrets before they reach the user or audit log.
 */

// Credential patterns that should NEVER appear in output
const OUTPUT_CREDENTIAL_PATTERNS = [
  // API keys
  /\b(sk-[a-zA-Z0-9_-]{20,})/g,
  /\b(sk-ant-[a-zA-Z0-9_-]{20,})/g,
  /\b(ghp_[a-zA-Z0-9]{36,})/g,
  /\b(github_pat_[a-zA-Z0-9_]{22,})/g,
  /\b(AKIA[0-9A-Z]{16})/g,
  /\b(xox[bsap]-[a-zA-Z0-9-]{10,})/g,
  // Bearer tokens
  /(Bearer\s+[a-zA-Z0-9._~+/=-]{20,})/g,
  // Connection strings with passwords
  /((?:postgres|mysql|mongodb|redis|amqp|mssql):\/\/[^:]+:[^@]+@[^\s]+)/g,
  // Generic password patterns in config
  /("?(?:password|passwd|secret|token|api_key|apikey|api-key)"?\s*[:=]\s*"?)([^"\s,}{]{8,})/gi,
  // Base64-encoded long strings (potential secrets)
  /\b([A-Za-z0-9+/]{40,}={0,2})\b/g,
];

// Known safe patterns to NOT redact (common base64 that aren't secrets)
const SAFE_PATTERNS = [
  /^[A-Fa-f0-9]+$/, // Pure hex strings
  /^[a-z]+$/i, // Pure alphabetic
];

export interface FilterResult {
  text: string;
  redactedCount: number;
  redactedPatterns: string[];
}

/**
 * Scan text for leaked credentials and redact them.
 * Returns the filtered text plus metadata about what was redacted.
 */
export function filterOutput(text: string): FilterResult {
  let filtered = text;
  let redactedCount = 0;
  const redactedPatterns: string[] = [];

  for (const pattern of OUTPUT_CREDENTIAL_PATTERNS) {
    // Reset regex state
    const regex = new RegExp(pattern.source, pattern.flags);
    filtered = filtered.replace(regex, (match, ...groups) => {
      // Check if it's a safe pattern
      const value = groups.find((g) => typeof g === "string" && g.length > 15) ?? match;
      if (SAFE_PATTERNS.some((sp) => sp.test(value))) return match;
      // Don't redact short matches (likely not secrets)
      if (value.length < 16) return match;

      redactedCount++;
      redactedPatterns.push(pattern.source.slice(0, 30));
      return "[REDACTED]";
    });
  }

  return { text: filtered, redactedCount, redactedPatterns };
}

/**
 * Quick check: does text contain any potential credentials?
 */
export function containsCredentials(text: string): boolean {
  return OUTPUT_CREDENTIAL_PATTERNS.some((p) => {
    const regex = new RegExp(p.source, p.flags);
    const match = regex.exec(text);
    if (!match) return false;
    const value = match[1] ?? match[0];
    if (value.length < 16) return false;
    return !SAFE_PATTERNS.some((sp) => sp.test(value));
  });
}
