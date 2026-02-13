import { z } from "zod";

export const skillPermissionsSchema = z.object({
  filesystem: z.enum(["none", "read", "write"]).default("none"),
  network: z.enum(["none", "local", "full"]).default("none"),
  env: z.enum(["none", "read"]).default("none"),
  exec: z.enum(["none", "restricted", "full"]).default("none"),
});

export const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().optional(),
  description: z.string().min(1),
  version: z.string().default("1.0.0"),
  author: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  permissions: skillPermissionsSchema.default({}),
  install: z.string().optional(),
});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

/**
 * Minimal YAML parser for SKILL.md frontmatter.
 * Handles: string values, arrays (- item), nested objects (indented keys), quoted strings.
 */
function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Skip empty lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const topMatch = line.match(/^(\w[\w.-]*)\s*:\s*(.*)/);
    if (!topMatch) {
      i++;
      continue;
    }

    const key = topMatch[1];
    const inlineValue = topMatch[2].trim();

    // Check if next lines are indented (nested object or array)
    if (inlineValue === "" && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const nextIndent = nextLine.match(/^(\s+)/);

      if (nextIndent) {
        const indentStr = nextIndent[1];
        const indentLen = indentStr.length;

        // Collect all indented lines
        const nested: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const sub = lines[j];
          if (sub.trim() === "" || sub.trim().startsWith("#")) {
            j++;
            continue;
          }
          const subIndent = sub.match(/^(\s+)/);
          if (!subIndent || subIndent[1].length < indentLen) break;
          nested.push(sub);
          j++;
        }

        // Detect array vs object
        const firstNested = nested[0]?.trim();
        if (firstNested?.startsWith("- ")) {
          // Array
          result[key] = nested
            .filter((l) => l.trim().startsWith("- "))
            .map((l) => unquote(l.trim().slice(2).trim()));
        } else {
          // Nested object
          const obj: Record<string, string> = {};
          for (const nl of nested) {
            const kvMatch = nl.trim().match(/^(\w[\w.-]*)\s*:\s*(.*)/);
            if (kvMatch) {
              obj[kvMatch[1]] = unquote(kvMatch[2].trim());
            }
          }
          result[key] = obj;
        }

        i = j;
        continue;
      }
    }

    // Inline array: [item1, item2]
    if (inlineValue.startsWith("[") && inlineValue.endsWith("]")) {
      const inner = inlineValue.slice(1, -1).trim();
      if (inner === "") {
        result[key] = [];
      } else {
        result[key] = inner.split(",").map((s) => unquote(s.trim()));
      }
      i++;
      continue;
    }

    // Simple scalar value
    result[key] = unquote(inlineValue);
    i++;
  }

  return result;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Serialize frontmatter to YAML string.
 */
function serializeYaml(obj: Record<string, unknown>, indent = 0): string {
  const prefix = " ".repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${prefix}${key}: []`);
      } else {
        lines.push(`${prefix}${key}:`);
        for (const item of value) {
          lines.push(`${prefix}  - ${quoteIfNeeded(String(item))}`);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${prefix}${key}:`);
      lines.push(serializeYaml(value as Record<string, unknown>, indent + 2));
    } else {
      lines.push(`${prefix}${key}: ${quoteIfNeeded(String(value))}`);
    }
  }

  return lines.join("\n");
}

function quoteIfNeeded(s: string): string {
  if (s.includes(":") || s.includes("#") || s.includes("{") || s.includes("}") ||
      s.includes("[") || s.includes("]") || s.includes(",") || s.includes("'") ||
      s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

export function parseSkillMd(content: string): { frontmatter: SkillFrontmatter; instructions: string } {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) {
    throw new Error("Missing frontmatter: file must start with ---");
  }

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) {
    throw new Error("Missing frontmatter closing ---");
  }

  const yamlBlock = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();

  const raw = parseYaml(yamlBlock);
  const parsed = skillFrontmatterSchema.parse(raw);

  return { frontmatter: parsed, instructions: body };
}

export function serializeSkillMd(frontmatter: SkillFrontmatter, instructions: string): string {
  const obj: Record<string, unknown> = {
    name: frontmatter.name,
  };
  if (frontmatter.emoji) obj.emoji = frontmatter.emoji;
  obj.description = frontmatter.description;
  obj.version = frontmatter.version;
  if (frontmatter.author) obj.author = frontmatter.author;
  obj.dependencies = frontmatter.dependencies;
  obj.permissions = frontmatter.permissions;
  if (frontmatter.install) obj.install = frontmatter.install;

  const yaml = serializeYaml(obj);
  return `---\n${yaml}\n---\n\n${instructions}\n`;
}
