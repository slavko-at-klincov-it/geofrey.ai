import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { parseSkillMd, serializeSkillMd } from "./format.js";
import type { SkillFrontmatter } from "./format.js";

export interface Skill {
  id: string;
  frontmatter: SkillFrontmatter;
  instructions: string;
  filePath: string;
  enabled: boolean;
  source: "global" | "local";
}

export type EnforcementMode = "warn" | "prompt" | "deny";

const skills = new Map<string, Skill>();

const GLOBAL_DIR = join(homedir(), ".geofrey", "skills");
const LOCAL_DIR = join(process.cwd(), ".geofrey", "skills");

function idFromPath(filePath: string): string {
  const name = basename(filePath);
  return name.replace(/\.md$/i, "").toLowerCase();
}

async function listSkillFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries
      .filter((e) => e.endsWith(".md"))
      .map((e) => join(dir, e));
  } catch {
    return [];
  }
}

export async function loadSkill(filePath: string, source: "global" | "local"): Promise<Skill> {
  const content = await readFile(filePath, "utf-8");
  const { frontmatter, instructions } = parseSkillMd(content);
  const id = idFromPath(filePath);

  return {
    id,
    frontmatter,
    instructions,
    filePath,
    enabled: true,
    source,
  };
}

export async function discoverSkills(): Promise<Skill[]> {
  skills.clear();

  const globalFiles = await listSkillFiles(GLOBAL_DIR);
  for (const f of globalFiles) {
    try {
      const skill = await loadSkill(f, "global");
      skills.set(skill.id, skill);
    } catch {
      // Skip invalid skill files
    }
  }

  // Local skills override global with same id
  const localFiles = await listSkillFiles(LOCAL_DIR);
  for (const f of localFiles) {
    try {
      const skill = await loadSkill(f, "local");
      skills.set(skill.id, skill);
    } catch {
      // Skip invalid skill files
    }
  }

  return Array.from(skills.values());
}

export function enableSkill(id: string): void {
  const skill = skills.get(id);
  if (skill) skill.enabled = true;
}

export function disableSkill(id: string): void {
  const skill = skills.get(id);
  if (skill) skill.enabled = false;
}

export function getEnabledSkills(): Skill[] {
  return Array.from(skills.values()).filter((s) => s.enabled);
}

export function getSkillById(id: string): Skill | undefined {
  return skills.get(id);
}

export function getAllSkills(): Skill[] {
  return Array.from(skills.values());
}

export async function generateSkill(
  name: string,
  description: string,
  instructions: string,
): Promise<string> {
  await mkdir(LOCAL_DIR, { recursive: true });

  const id = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  const fileName = `${id}.md`;
  const filePath = join(LOCAL_DIR, fileName);

  const frontmatter: SkillFrontmatter = {
    name,
    description,
    version: "1.0.0",
    dependencies: [],
    permissions: {
      filesystem: "none",
      network: "none",
      env: "none",
      exec: "none",
    },
  };

  const content = serializeSkillMd(frontmatter, instructions);
  await writeFile(filePath, content, "utf-8");

  // Register in memory
  const skill: Skill = {
    id,
    frontmatter,
    instructions,
    filePath,
    enabled: true,
    source: "local",
  };
  skills.set(id, skill);

  return filePath;
}

export function checkPermissions(
  skill: Skill,
  mode: EnforcementMode,
): { allowed: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const perms = skill.frontmatter.permissions;

  if (perms.filesystem === "write") {
    warnings.push(`filesystem: write access requested by "${skill.frontmatter.name}"`);
  }
  if (perms.network === "full") {
    warnings.push(`network: full internet access requested by "${skill.frontmatter.name}"`);
  }
  if (perms.exec === "full") {
    warnings.push(`exec: full command execution requested by "${skill.frontmatter.name}"`);
  }
  if (perms.env === "read") {
    warnings.push(`env: environment variable read access requested by "${skill.frontmatter.name}"`);
  }

  if (mode === "deny" && warnings.length > 0) {
    return { allowed: false, warnings };
  }

  return { allowed: true, warnings };
}

/** Reset the internal skill map (for testing) */
export function _resetSkills(): void {
  skills.clear();
}
