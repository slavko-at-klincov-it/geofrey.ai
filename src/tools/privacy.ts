import { z } from "zod";
import { registerTool } from "./tool-registry.js";
import {
  createRule,
  listRules,
  deleteRule,
  exportRulesAsMd,
} from "../privacy/rules-store.js";
import { t } from "../i18n/index.js";

let dbUrl = "./data/app.db";

/** Set the database URL for privacy rules (called during init). */
export function setPrivacyDbUrl(url: string): void {
  dbUrl = url;
}

registerTool({
  name: "privacy_rules",
  description:
    "Manage privacy rules — control what gets anonymized, blocked, or allowed before data reaches cloud APIs.",
  parameters: z.object({
    action: z.enum(["create", "list", "delete", "export"]),
    category: z
      .enum(["email", "name", "path", "secret", "custom"])
      .optional()
      .describe("Rule category (required for create)"),
    pattern: z
      .string()
      .optional()
      .describe("Regex pattern or literal string to match (required for create)"),
    ruleAction: z
      .enum(["anonymize", "block", "allow"])
      .optional()
      .describe("What to do when pattern matches (required for create)"),
    scope: z
      .enum(["global", "session"])
      .optional()
      .default("global")
      .describe("Rule scope"),
    label: z
      .string()
      .optional()
      .describe("Human-readable label"),
    id: z
      .string()
      .optional()
      .describe("Rule ID (required for delete)"),
  }),
  source: "native",
  execute: async ({ action, category, pattern, ruleAction, scope, label, id }) => {
    switch (action) {
      case "create": {
        if (!category) {
          return t("tools.paramRequired", { param: "category", action: "create" });
        }
        if (!pattern) {
          return t("tools.paramRequired", { param: "pattern", action: "create" });
        }
        if (!ruleAction) {
          return t("tools.paramRequired", { param: "ruleAction", action: "create" });
        }
        const rule = createRule(dbUrl, {
          category,
          pattern,
          action: ruleAction,
          scope: scope ?? "global",
          label: label ?? undefined,
        });
        return `Rule created: ${rule.id} — ${rule.pattern} → ${rule.action} [${rule.scope}]`;
      }

      case "list": {
        const rules = listRules(dbUrl, scope as "global" | "session" | undefined);
        if (rules.length === 0) return "No privacy rules defined.";
        return rules
          .map(
            (r) =>
              `${r.id}: ${r.label ?? r.pattern} (${r.category}) → ${r.action} [${r.scope}]`,
          )
          .join("\n");
      }

      case "delete": {
        if (!id) {
          return t("tools.paramRequired", { param: "id", action: "delete" });
        }
        const deleted = deleteRule(dbUrl, id);
        return deleted ? `Rule ${id} deleted.` : `Rule ${id} not found.`;
      }

      case "export": {
        return exportRulesAsMd(dbUrl);
      }
    }
  },
});
