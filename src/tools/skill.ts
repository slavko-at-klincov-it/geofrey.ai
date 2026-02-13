import { z } from "zod";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { registerTool } from "./tool-registry.js";
import {
  discoverSkills,
  enableSkill,
  disableSkill,
  getAllSkills,
  getSkillById,
  generateSkill,
} from "../skills/registry.js";
import { parseSkillMd } from "../skills/format.js";
import { t } from "../i18n/index.js";

const LOCAL_DIR = join(process.cwd(), ".geofrey", "skills");

function formatSkill(s: { id: string; frontmatter: { name: string; emoji?: string; description: string; version: string }; enabled: boolean; source: string }): string {
  const emoji = s.frontmatter.emoji ? `${s.frontmatter.emoji} ` : "";
  const status = s.enabled ? "enabled" : "disabled";
  return `[${s.id}] ${emoji}${s.frontmatter.name} v${s.frontmatter.version} (${s.source}, ${status}) — ${s.frontmatter.description}`;
}

registerTool({
  name: "skill",
  description: "Manage skills: list available skills, install from URL/path, enable/disable, generate new skills.",
  parameters: z.object({
    action: z.enum(["list", "install", "enable", "disable", "generate"]),
    id: z.string().optional(),
    url: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    instructions: z.string().optional(),
  }),
  source: "native",
  execute: async (args) => {
    switch (args.action) {
      case "list": {
        await discoverSkills();
        const all = getAllSkills();
        if (all.length === 0) return t("skills.noSkills");
        const header = t("skills.listed", { count: String(all.length) });
        const lines = all.map(formatSkill);
        return `${header}\n${lines.join("\n")}`;
      }

      case "enable": {
        if (!args.id) return "Error: 'id' is required for enable";
        const skill = getSkillById(args.id);
        if (!skill) return t("skills.notFound", { id: args.id });
        enableSkill(args.id);
        return t("skills.enabled", { name: skill.frontmatter.name });
      }

      case "disable": {
        if (!args.id) return "Error: 'id' is required for disable";
        const skill = getSkillById(args.id);
        if (!skill) return t("skills.notFound", { id: args.id });
        disableSkill(args.id);
        return t("skills.disabled", { name: skill.frontmatter.name });
      }

      case "install": {
        if (!args.url) return "Error: 'url' is required for install";
        const source = args.url;

        let content: string;
        if (source.startsWith("http://") || source.startsWith("https://")) {
          const response = await fetch(source);
          if (!response.ok) {
            return `Error: failed to fetch ${source} (${response.status})`;
          }
          content = await response.text();
        } else {
          content = await readFile(source, "utf-8");
        }

        // Validate the file
        let parsed: ReturnType<typeof parseSkillMd>;
        try {
          parsed = parseSkillMd(content);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return t("skills.invalidFormat", { msg });
        }

        const id = parsed.frontmatter.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
        const fileName = `${id}.md`;

        await mkdir(LOCAL_DIR, { recursive: true });
        const filePath = join(LOCAL_DIR, fileName);
        await writeFile(filePath, content, "utf-8");

        // Re-discover to pick up new skill
        await discoverSkills();
        return t("skills.installed", { name: parsed.frontmatter.name });
      }

      case "generate": {
        if (!args.name) return "Error: 'name' is required for generate";
        if (!args.description) return "Error: 'description' is required for generate";
        if (!args.instructions) return "Error: 'instructions' is required for generate";

        const filePath = await generateSkill(args.name, args.description, args.instructions);
        return t("skills.generated", { name: args.name, path: filePath });
      }
    }
  },
});
