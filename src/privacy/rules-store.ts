import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { privacyRules } from "../db/schema.js";
import { randomBytes } from "node:crypto";

export interface PrivacyRule {
  id: string;
  category: string;
  pattern: string;
  action: "anonymize" | "block" | "allow";
  scope: "global" | "session";
  label: string | null;
  createdAt: string;
}

function generateId(): string {
  return randomBytes(8).toString("hex");
}

export function createRule(
  dbUrl: string,
  params: {
    category: string;
    pattern: string;
    action: "anonymize" | "block" | "allow";
    scope?: "global" | "session";
    label?: string;
  },
): PrivacyRule {
  const db = getDb(dbUrl);
  const id = generateId();
  const rule: PrivacyRule = {
    id,
    category: params.category,
    pattern: params.pattern,
    action: params.action,
    scope: params.scope ?? "global",
    label: params.label ?? null,
    createdAt: new Date().toISOString(),
  };
  db.insert(privacyRules).values(rule).run();
  return rule;
}

export function listRules(dbUrl: string, scope?: "global" | "session"): PrivacyRule[] {
  const db = getDb(dbUrl);
  if (scope) {
    return db
      .select()
      .from(privacyRules)
      .where(eq(privacyRules.scope, scope))
      .all() as PrivacyRule[];
  }
  return db.select().from(privacyRules).all() as PrivacyRule[];
}

export function getRule(dbUrl: string, id: string): PrivacyRule | undefined {
  const db = getDb(dbUrl);
  return db
    .select()
    .from(privacyRules)
    .where(eq(privacyRules.id, id))
    .get() as PrivacyRule | undefined;
}

export function deleteRule(dbUrl: string, id: string): boolean {
  const db = getDb(dbUrl);
  const result = db.delete(privacyRules).where(eq(privacyRules.id, id)).run();
  return result.changes > 0;
}

export function findRulesByCategory(dbUrl: string, category: string): PrivacyRule[] {
  const db = getDb(dbUrl);
  return db
    .select()
    .from(privacyRules)
    .where(eq(privacyRules.category, category))
    .all() as PrivacyRule[];
}

/** Export all rules as Markdown for user inspection. */
export function exportRulesAsMd(dbUrl: string): string {
  const rules = listRules(dbUrl);
  if (rules.length === 0) return "# Privacy Rules\n\nKeine Regeln definiert.\n";
  const lines = ["# Privacy Rules\n"];
  for (const r of rules) {
    lines.push(
      `- **${r.label ?? r.pattern}** (${r.category}) → ${r.action} [${r.scope}]`,
    );
  }
  return lines.join("\n") + "\n";
}
