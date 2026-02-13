import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { parseSkillMd, serializeSkillMd } from "./format.js";
import { verifyHash, parseChecksumFile } from "./verification.js";
import { getTemplateById, getAllTemplates, searchTemplates } from "./templates.js";
import type { SkillFrontmatter } from "./format.js";
import type { SkillTemplate } from "./templates.js";

// --- Constants ---

const MARKETPLACE_REPO_BASE = "https://raw.githubusercontent.com/geofrey-ai/skills/main";
const MARKETPLACE_DIR = join(process.cwd(), ".geofrey", "marketplace");
const FETCH_TIMEOUT_MS = 15_000;

const MARKETPLACE_CATEGORIES = [
  "smart-home",
  "productivity",
  "media",
  "development",
  "communication",
  "utilities",
] as const;

export type MarketplaceCategory = typeof MARKETPLACE_CATEGORIES[number];

// --- Schemas ---

export const marketplaceEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(MARKETPLACE_CATEGORIES),
  version: z.string().min(1),
  hash: z.string().regex(/^[a-f0-9]{64}$/i, "Must be a valid SHA-256 hash"),
  author: z.string().optional(),
});

export type MarketplaceEntry = z.infer<typeof marketplaceEntrySchema>;

export const marketplaceIndexSchema = z.object({
  version: z.string().default("1"),
  skills: z.array(marketplaceEntrySchema),
});

export type MarketplaceIndex = z.infer<typeof marketplaceIndexSchema>;

// --- Internal state ---

let cachedIndex: MarketplaceIndex | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 300_000; // 5 minutes

// --- Helper functions ---

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildSkillUrl(category: string, skillId: string): string {
  return `${MARKETPLACE_REPO_BASE}/${category}/${skillId}/SKILL.md`;
}

function buildChecksumUrl(category: string, skillId: string): string {
  return `${MARKETPLACE_REPO_BASE}/${category}/${skillId}/checksum.sha256`;
}

// --- Core functions ---

/**
 * Fetch the marketplace index from the curated GitHub repository.
 * Returns cached version if within TTL.
 */
export async function fetchMarketplaceIndex(
  opts: { baseUrl?: string; forceRefresh?: boolean } = {},
): Promise<{ ok: true; index: MarketplaceIndex } | { ok: false; error: string }> {
  const baseUrl = opts.baseUrl ?? MARKETPLACE_REPO_BASE;

  // Return cached if fresh
  if (!opts.forceRefresh && cachedIndex && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return { ok: true, index: cachedIndex };
  }

  const url = `${baseUrl}/index.json`;

  let response: Response;
  try {
    response = await fetchWithTimeout(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to fetch marketplace index: ${msg}` };
  }

  if (!response.ok) {
    return { ok: false, error: `Marketplace index fetch failed (HTTP ${response.status})` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: "Marketplace index is not valid JSON" };
  }

  const parsed = marketplaceIndexSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `Invalid marketplace index format: ${parsed.error.message}` };
  }

  cachedIndex = parsed.data;
  cacheTimestamp = Date.now();

  return { ok: true, index: parsed.data };
}

/**
 * Search marketplace skills by query (matches id, name, description, category).
 */
export async function searchMarketplace(
  query: string,
  opts: { baseUrl?: string } = {},
): Promise<string> {
  const result = await fetchMarketplaceIndex(opts);
  if (!result.ok) return `Error: ${result.error}`;

  const lower = query.toLowerCase();
  const matches = result.index.skills.filter(
    (s) =>
      s.id.includes(lower) ||
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower) ||
      s.category.includes(lower),
  );

  if (matches.length === 0) {
    return `No marketplace skills found matching "${query}"`;
  }

  const lines = matches.map((s) => formatEntry(s));
  return `Found ${matches.length} skill(s) matching "${query}":\n${lines.join("\n")}`;
}

/**
 * List all available marketplace skills.
 */
export async function listMarketplace(
  opts: { baseUrl?: string; category?: string } = {},
): Promise<string> {
  const result = await fetchMarketplaceIndex(opts);
  if (!result.ok) return `Error: ${result.error}`;

  let skills = result.index.skills;

  if (opts.category) {
    skills = skills.filter((s) => s.category === opts.category);
  }

  if (skills.length === 0) {
    const suffix = opts.category ? ` in category "${opts.category}"` : "";
    return `No skills available in the marketplace${suffix}`;
  }

  // Group by category
  const grouped = new Map<string, MarketplaceEntry[]>();
  for (const s of skills) {
    const list = grouped.get(s.category) ?? [];
    list.push(s);
    grouped.set(s.category, list);
  }

  const sections: string[] = [];
  for (const [category, entries] of grouped) {
    const header = `## ${category}`;
    const lines = entries.map((s) => formatEntry(s));
    sections.push(`${header}\n${lines.join("\n")}`);
  }

  return `Marketplace skills (${skills.length} total):\n\n${sections.join("\n\n")}`;
}

/**
 * Install a skill from the marketplace.
 * Downloads SKILL.md and checksum, verifies hash, writes to marketplace directory.
 */
export async function installFromMarketplace(
  skillId: string,
  opts: { baseUrl?: string; verifyHashes?: boolean; installDir?: string } = {},
): Promise<string> {
  const baseUrl = opts.baseUrl ?? MARKETPLACE_REPO_BASE;
  const verifyHashes = opts.verifyHashes ?? true;
  const installDir = opts.installDir ?? MARKETPLACE_DIR;

  // Fetch index to find the skill
  const indexResult = await fetchMarketplaceIndex({ baseUrl });
  if (!indexResult.ok) return `Error: ${indexResult.error}`;

  const entry = indexResult.index.skills.find((s) => s.id === skillId);
  if (!entry) {
    return `Error: Skill "${skillId}" not found in marketplace`;
  }

  // Download SKILL.md
  const skillUrl = opts.baseUrl
    ? `${baseUrl}/${entry.category}/${entry.id}/SKILL.md`
    : buildSkillUrl(entry.category, entry.id);

  let skillContent: string;
  try {
    const resp = await fetchWithTimeout(skillUrl);
    if (!resp.ok) {
      return `Error: Failed to download skill "${skillId}" (HTTP ${resp.status})`;
    }
    skillContent = await resp.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error: Failed to download skill "${skillId}": ${msg}`;
  }

  // Validate SKILL.md format
  try {
    parseSkillMd(skillContent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error: Downloaded skill "${skillId}" has invalid format: ${msg}`;
  }

  // Hash verification
  if (verifyHashes) {
    // Download checksum
    const checksumUrl = opts.baseUrl
      ? `${baseUrl}/${entry.category}/${entry.id}/checksum.sha256`
      : buildChecksumUrl(entry.category, entry.id);

    let checksumContent: string;
    try {
      const resp = await fetchWithTimeout(checksumUrl);
      if (!resp.ok) {
        return `Error: Failed to download checksum for "${skillId}" (HTTP ${resp.status})`;
      }
      checksumContent = await resp.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: Failed to download checksum for "${skillId}": ${msg}`;
    }

    const expectedHash = parseChecksumFile(checksumContent);
    if (!expectedHash) {
      return `Error: Invalid checksum file format for "${skillId}"`;
    }

    // Verify against checksum file
    const fileResult = verifyHash(skillContent, expectedHash);
    if (!fileResult.valid) {
      return `Error: Hash verification failed for "${skillId}" — ${fileResult.reason}. Skill NOT installed.`;
    }

    // Also verify against index hash
    const indexResult = verifyHash(skillContent, entry.hash);
    if (!indexResult.valid) {
      return `Error: Index hash verification failed for "${skillId}" — ${indexResult.reason}. Skill NOT installed.`;
    }
  } else {
    // Warn user that hash verification is disabled
  }

  // Write to marketplace directory as flat file (registry discovers *.md files)
  await mkdir(installDir, { recursive: true });
  const filePath = join(installDir, `${entry.id}.md`);
  await writeFile(filePath, skillContent, "utf-8");

  const warningSuffix = verifyHashes ? "" : " (hash verification was SKIPPED)";
  return `Installed "${entry.name}" v${entry.version} to ${filePath}${warningSuffix}`;
}

/**
 * List all built-in skill templates.
 */
export function listTemplates(): string {
  const templates = getAllTemplates();
  if (templates.length === 0) return "No templates available";

  const lines = templates.map((t) => formatTemplate(t));
  return `Available skill templates (${templates.length}):\n${lines.join("\n")}`;
}

/**
 * Generate a new skill from a built-in template.
 * Writes the generated SKILL.md to the local skills directory.
 */
export async function createFromTemplate(
  templateId: string,
  opts: { outputDir?: string } = {},
): Promise<string> {
  const template = getTemplateById(templateId);
  if (!template) {
    const available = getAllTemplates().map((t) => t.id).join(", ");
    return `Error: Template "${templateId}" not found. Available: ${available}`;
  }

  const outputDir = opts.outputDir ?? join(process.cwd(), ".geofrey", "skills");
  await mkdir(outputDir, { recursive: true });

  const content = serializeSkillMd(template.frontmatter, template.instructions);
  const fileName = `${template.frontmatter.name}.md`;
  const filePath = join(outputDir, fileName);
  await writeFile(filePath, content, "utf-8");

  return `Created skill "${template.name}" from template at ${filePath}`;
}

/**
 * Search built-in templates by query.
 */
export function searchSkillTemplates(query: string): string {
  const matches = searchTemplates(query);
  if (matches.length === 0) {
    return `No templates found matching "${query}"`;
  }

  const lines = matches.map((t) => formatTemplate(t));
  return `Found ${matches.length} template(s) matching "${query}":\n${lines.join("\n")}`;
}

// --- Formatting helpers ---

function formatEntry(entry: MarketplaceEntry): string {
  const author = entry.author ? ` by ${entry.author}` : "";
  return `  [${entry.id}] ${entry.name} v${entry.version} (${entry.category}${author}) — ${entry.description}`;
}

function formatTemplate(template: SkillTemplate): string {
  const emoji = template.frontmatter.emoji ? `${template.frontmatter.emoji} ` : "";
  return `  [${template.id}] ${emoji}${template.name} (${template.category}) — ${template.description}`;
}

/** Reset the cached index (for testing). */
export function _resetCache(): void {
  cachedIndex = null;
  cacheTimestamp = 0;
}
