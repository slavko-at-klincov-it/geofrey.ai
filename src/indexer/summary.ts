import type { ExportInfo } from "./parser.js";

const CATEGORY_MAP: Record<string, string> = {
  tools: "Tools",
  approval: "Approval",
  messaging: "Messaging",
  orchestrator: "Orchestrator",
  security: "Security",
  audit: "Audit",
  db: "Database",
  i18n: "i18n",
  onboarding: "Onboarding",
  config: "Config",
  indexer: "Indexer",
};

export function deriveCategory(filePath: string): string {
  // Match first directory under src/
  const match = filePath.match(/^src\/([^/]+)\//);
  if (match) {
    return CATEGORY_MAP[match[1]] ?? capitalize(match[1]);
  }
  // Root-level src files
  if (filePath.startsWith("src/")) return "Core";
  return "Other";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isTestFile(filePath: string): boolean {
  return /\.test\.ts$/.test(filePath);
}

export function generateSummary(
  filePath: string,
  exports: ExportInfo[],
  leadingComment: string | null,
): string {
  const category = deriveCategory(filePath);

  // Test files
  if (isTestFile(filePath)) {
    const sibling = filePath.replace(/\.test\.ts$/, ".ts").split("/").pop() ?? "module";
    return `Tests for ${sibling}`;
  }

  // Priority 1: Leading JSDoc comment
  if (leadingComment) {
    return leadingComment;
  }

  // Priority 2: Export-based summary
  if (exports.length > 0) {
    const MAX_SHOWN = 4;
    const names = exports.map((e) => e.name);
    const shown = names.slice(0, MAX_SHOWN).join(", ");
    const kinds = [...new Set(exports.map((e) => e.kind))].join(", ");
    const suffix = names.length > MAX_SHOWN ? ` +${names.length - MAX_SHOWN} more` : "";
    return `${category}: ${shown}${suffix} (${kinds})`;
  }

  // Priority 3: Fallback
  return `${category} module`;
}
