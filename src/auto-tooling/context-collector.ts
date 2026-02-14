import { readMemory } from "../memory/store.js";
import { getCachedProfile } from "../profile/store.js";

export interface AutoToolContext {
  taskDescription: string;
  requirements: string[];
  constraints: string[];
  userPreferences: string[];
  userDoesntWant: string[];
  techStack: string[];
  outputType: "cron_job" | "background_process" | "one_shot" | "unknown";
}

/**
 * Collects context for auto-tool generation from user request + memory.
 */
export async function collectContext(
  userRequest: string,
  clarifications?: string[],
): Promise<AutoToolContext> {
  // Read memory for preferences
  let memoryContent = "";
  try {
    memoryContent = await readMemory();
  } catch {
    // Non-critical
  }

  // Extract preferences and doesn't-want from memory
  const userPreferences = extractSection(memoryContent, "preferences");
  const userDoesntWant = extractSection(memoryContent, "doesnt-want");

  // Determine output type from request
  const outputType = inferOutputType(userRequest);

  // Get profile for tech context
  const profile = getCachedProfile();
  const techStack: string[] = ["TypeScript", "Node.js"];
  if (profile?.calendarApp.provider === "google") techStack.push("Google Calendar API");
  if (profile?.notesApp.provider === "obsidian") techStack.push("Obsidian");

  return {
    taskDescription: userRequest,
    requirements: clarifications ?? [],
    constraints: [
      "Must run autonomously without user interaction",
      "Must handle errors gracefully",
      "Must log activity to stdout",
      ...userDoesntWant.map((d) => `User explicitly doesn't want: ${d}`),
    ],
    userPreferences,
    userDoesntWant,
    techStack,
    outputType,
  };
}

export function inferOutputType(request: string): AutoToolContext["outputType"] {
  const lower = request.toLowerCase();
  if (/regelmäßig|every|cron|schedule|interval|täglich|wöchentlich|daily|weekly|hourly/i.test(lower)) {
    return "cron_job";
  }
  if (/server|daemon|background|hintergrund|service|listen/i.test(lower)) {
    return "background_process";
  }
  if (/einmal|once|jetzt|now|sofort/i.test(lower)) {
    return "one_shot";
  }
  return "unknown";
}

export function extractSection(memory: string, section: string): string[] {
  const lines = memory.split("\n");
  const results: string[] = [];
  let inSection = false;

  // Normalize section name for matching (doesnt-want matches doesn't-want)
  const normalized = section.toLowerCase().replace(/['']/g, "");

  for (const line of lines) {
    const lower = line.toLowerCase().replace(/['']/g, "");
    if (lower.includes(`## ${normalized}`) || lower.includes(`# ${normalized}`)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,2}\s/.test(line)) {
      inSection = false;
      continue;
    }
    if (inSection && line.startsWith("- ")) {
      results.push(line.slice(2).trim());
    }
  }

  return results;
}
