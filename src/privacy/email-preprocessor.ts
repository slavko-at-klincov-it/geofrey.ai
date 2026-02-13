/**
 * Preprocesses email content for privacy before sending to Claude Code or LLM.
 * Anonymizes PII (emails, names, secrets) in email fields using the shared anonymizer pipeline.
 */

import { type GmailMessage } from "../integrations/google/gmail.js";
import { anonymize, type AnonymizerConfig } from "../anonymizer/anonymizer.js";
import type { MappingTable } from "../anonymizer/mapping.js";

export interface SanitizedEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  labelIds: string[];
  mappingTable: MappingTable;
}

/**
 * Anonymize a single email's text fields via the shared anonymizer pipeline.
 * Combines all text fields with a separator, anonymizes in one pass (for consistent
 * placeholder numbering), then splits back.
 */
export async function sanitizeEmail(
  email: GmailMessage,
  config: AnonymizerConfig,
): Promise<SanitizedEmail> {
  // Combine all text fields for anonymization
  const combined = [
    email.from,
    email.to,
    email.subject,
    email.snippet,
    email.body ?? "",
  ].join("\n__SEP__\n");

  const { text: anonymized, table } = await anonymize(combined, config);
  const parts = anonymized.split("\n__SEP__\n");

  return {
    id: email.id,
    threadId: email.threadId,
    subject: parts[2] ?? email.subject,
    from: parts[0] ?? email.from,
    to: parts[1] ?? email.to,
    date: email.date,
    snippet: parts[3] ?? email.snippet,
    body: parts[4] || undefined,
    labelIds: email.labelIds,
    mappingTable: table,
  };
}

/**
 * Anonymize multiple emails in parallel.
 */
export async function sanitizeEmails(
  emails: GmailMessage[],
  config: AnonymizerConfig,
): Promise<SanitizedEmail[]> {
  return Promise.all(emails.map((e) => sanitizeEmail(e, config)));
}

/**
 * Format a sanitized email for LLM consumption (plain-text representation).
 */
export function formatEmailForLlm(email: SanitizedEmail): string {
  const lines = [
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Date: ${email.date}`,
    `Subject: ${email.subject}`,
    "",
    email.body ?? email.snippet,
  ];
  return lines.join("\n");
}
