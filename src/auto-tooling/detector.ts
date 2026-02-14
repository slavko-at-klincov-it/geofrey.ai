import { t } from "../i18n/index.js";

/**
 * Known tool capability categories.
 * Maps high-level intents to the tools that can handle them.
 */
const CAPABILITY_MAP: Record<string, string[]> = {
  "file_read": ["read_file", "list_dir", "search"],
  "file_write": ["write_file", "delete_file"],
  "git": ["git_status", "git_log", "git_diff", "git_add", "git_commit"],
  "shell": ["shell_exec"],
  "coding": ["claude_code"],
  "web": ["web_search", "web_fetch"],
  "email_read": ["gmail_list", "gmail_read"],
  "email_send": ["gmail_send"],
  "calendar": ["calendar_list", "calendar_get", "calendar_create"],
  "memory": ["memory_read", "memory_write", "memory_search"],
  "browser": ["browser"],
  "cron": ["cron_create", "cron_list", "cron_delete"],
  "process": ["process_spawn", "process_list", "process_kill"],
  "smart_home": ["smart_home"],
  "tts": ["tts_speak"],
};

/**
 * Analyzes a user request and determines if it requires capabilities
 * that no existing tool provides.
 */
export interface GapAnalysis {
  hasGap: boolean;
  missingCapability: string;
  suggestion: string;
  existingTools: string[];
}

export function detectCapabilityGap(
  userRequest: string,
  failedToolName?: string,
  failedReason?: string,
): GapAnalysis {
  const request = userRequest.toLowerCase();

  // Check for common unhandled patterns
  const gaps: Array<{ pattern: RegExp; capability: string; suggestion: string }> = [
    { pattern: /attachment|anhang|anlage/i, capability: "email_attachment_download", suggestion: "Download and save email attachments" },
    { pattern: /pdf.*generat|pdf.*erstell|create.*pdf/i, capability: "pdf_generation", suggestion: "Generate PDF documents" },
    { pattern: /spreadsheet|excel|csv.*analys/i, capability: "spreadsheet_processing", suggestion: "Process spreadsheet data" },
    { pattern: /backup|sicher.*kopie/i, capability: "backup_automation", suggestion: "Automated backup system" },
    { pattern: /monitor.*website|uptime|website.*check/i, capability: "website_monitoring", suggestion: "Website uptime monitoring" },
    { pattern: /sync.*files|dateien.*sync|rsync/i, capability: "file_sync", suggestion: "File synchronization service" },
    { pattern: /api.*endpoint|rest.*api|webhook.*empfang/i, capability: "custom_api", suggestion: "Custom REST API endpoint" },
    { pattern: /scrape|crawl|extract.*from.*website/i, capability: "web_scraping", suggestion: "Web scraping and data extraction" },
    { pattern: /database.*migration|db.*migrate/i, capability: "db_migration", suggestion: "Database migration tool" },
    { pattern: /notification.*service|benachrichtigung.*dienst/i, capability: "notification_service", suggestion: "Custom notification service" },
  ];

  for (const gap of gaps) {
    if (gap.pattern.test(request)) {
      return {
        hasGap: true,
        missingCapability: gap.capability,
        suggestion: gap.suggestion,
        existingTools: Object.values(CAPABILITY_MAP).flat(),
      };
    }
  }

  // If a tool explicitly failed, that's also a gap
  if (failedToolName && failedReason) {
    return {
      hasGap: true,
      missingCapability: `${failedToolName}_extended`,
      suggestion: `Extended ${failedToolName} functionality: ${failedReason}`,
      existingTools: Object.values(CAPABILITY_MAP).flat(),
    };
  }

  return {
    hasGap: false,
    missingCapability: "",
    suggestion: "",
    existingTools: Object.values(CAPABILITY_MAP).flat(),
  };
}

/**
 * Formats a proposal message for the user.
 */
export function formatProposal(gap: GapAnalysis): string {
  return t("autoTooling.proposal", {
    capability: gap.missingCapability,
    suggestion: gap.suggestion,
  });
}
