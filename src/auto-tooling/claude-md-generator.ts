import { readMemory } from "../memory/store.js";
import { getCachedProfile } from "../profile/store.js";

export interface ClaudeMdOptions {
  projectName: string;
  taskDescription: string;
  requirements: string[];
  constraints: string[];
  userPreferences: string[];
  userDoesntWant: string[];
  techStack: string[];
}

/**
 * Generates the initial CLAUDE.md for an auto-generated project.
 * This is the deterministic part — Claude Code can enrich it later.
 */
export function generateClaudeMd(opts: ClaudeMdOptions): string {
  const sections: string[] = [];

  // Header
  sections.push(`# ${opts.projectName}`);
  sections.push("");
  sections.push("## Overview");
  sections.push(opts.taskDescription);
  sections.push("");

  // Requirements
  if (opts.requirements.length > 0) {
    sections.push("## Requirements");
    for (const req of opts.requirements) {
      sections.push(`- ${req}`);
    }
    sections.push("");
  }

  // Tech Stack
  if (opts.techStack.length > 0) {
    sections.push("## Tech Stack");
    for (const tech of opts.techStack) {
      sections.push(`- ${tech}`);
    }
    sections.push("");
  }

  // What We Don't Want
  if (opts.userDoesntWant.length > 0) {
    sections.push("## What We Don't Want");
    for (const item of opts.userDoesntWant) {
      sections.push(`- ${item}`);
    }
    sections.push("");
  }

  // User Preferences
  if (opts.userPreferences.length > 0) {
    sections.push("## User Preferences");
    for (const pref of opts.userPreferences) {
      sections.push(`- ${pref}`);
    }
    sections.push("");
  }

  // Constraints
  sections.push("## Constraints");
  sections.push("- Must run autonomously without user interaction");
  sections.push("- Must handle errors gracefully with proper logging");
  sections.push("- Must exit cleanly on SIGTERM/SIGINT");
  sections.push("- All output goes to stdout (for log capture)");
  for (const c of opts.constraints) {
    if (!sections.includes(`- ${c}`)) sections.push(`- ${c}`);
  }
  sections.push("");

  // Conventions (placeholder for Claude Code enrichment)
  sections.push("## Conventions");
  sections.push("- TypeScript with strict mode");
  sections.push("- ESM modules");
  sections.push("- Zod for input validation");
  sections.push("- No unnecessary dependencies");
  sections.push("");

  return sections.join("\n") + "\n";
}

/**
 * Builds the full CLAUDE.md content by combining deterministic user data
 * with profile-derived preferences.
 */
export async function buildProjectClaudeMd(
  projectName: string,
  taskDescription: string,
  requirements: string[],
  constraints: string[],
  techStack: string[],
): Promise<string> {
  // Read memory for user preferences
  let memoryContent = "";
  try {
    memoryContent = await readMemory();
  } catch {
    // Non-critical
  }

  const userPreferences = extractBullets(memoryContent, "preferences");
  const userDoesntWant = extractBullets(memoryContent, "doesnt-want");

  // Add profile-derived info
  const profile = getCachedProfile();
  if (profile) {
    if (profile.communicationStyle === "formal") {
      userPreferences.push("Communication style: formal");
    }
    if (profile.timezone) {
      userPreferences.push(`Timezone: ${profile.timezone}`);
    }
  }

  return generateClaudeMd({
    projectName,
    taskDescription,
    requirements,
    constraints,
    userPreferences,
    userDoesntWant,
    techStack,
  });
}

/**
 * Extracts bullet points from a markdown section matching the given heading.
 * Searches for ## or ### headings containing the heading text (case-insensitive).
 */
export function extractBullets(text: string, heading: string): string[] {
  const results: string[] = [];
  const lines = text.split("\n");
  let inSection = false;

  for (const line of lines) {
    if (line.toLowerCase().includes(heading.toLowerCase()) && /^#{1,3}\s/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,3}\s/.test(line)) {
      inSection = false;
      continue;
    }
    if (inSection && line.startsWith("- ")) {
      results.push(line.slice(2).trim());
    }
  }
  return results;
}
