import { readMemory, writeMemory } from "./store.js";

export type MemoryCategory = "preferences" | "decisions" | "facts" | "wants" | "doesnt-want";

export interface StructuredEntry {
  category: MemoryCategory;
  content: string;
  date?: string;
}

const SECTION_HEADERS: Record<MemoryCategory, string> = {
  preferences: "## Preferences",
  decisions: "## Decisions",
  facts: "## Facts",
  wants: "## Wants",
  "doesnt-want": "## Doesn't-Want",
};

const SECTION_ORDER: MemoryCategory[] = ["preferences", "decisions", "wants", "doesnt-want", "facts"];

/** Map lowercase heading text to MemoryCategory */
function headingToCategory(heading: string): MemoryCategory | null {
  const lower = heading.toLowerCase().trim();
  if (lower === "preferences") return "preferences";
  if (lower === "decisions") return "decisions";
  if (lower === "facts") return "facts";
  if (lower === "wants") return "wants";
  if (lower === "doesn't-want" || lower === "doesnt-want") return "doesnt-want";
  return null;
}

export function parseStructuredMemory(markdown: string): StructuredEntry[] {
  const entries: StructuredEntry[] = [];
  let currentCategory: MemoryCategory | null = null;

  for (const line of markdown.split("\n")) {
    const headingMatch = /^##\s+(.+)$/.exec(line);
    if (headingMatch) {
      currentCategory = headingToCategory(headingMatch[1]);
      continue;
    }

    if (!currentCategory) continue;

    const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
    if (!bulletMatch) continue;

    const content = bulletMatch[1].trim();
    // Extract optional date prefix [2026-02-14]
    const dateMatch = /^\[(\d{4}-\d{2}-\d{2})\]\s*(.+)$/.exec(content);
    if (dateMatch) {
      entries.push({ category: currentCategory, content: dateMatch[2], date: dateMatch[1] });
    } else {
      entries.push({ category: currentCategory, content });
    }
  }

  return entries;
}

export function formatStructuredMemory(entries: StructuredEntry[]): string {
  const sections: string[] = [];

  for (const category of SECTION_ORDER) {
    const categoryEntries = entries.filter((e) => e.category === category);
    if (categoryEntries.length === 0) continue;

    sections.push(SECTION_HEADERS[category]);
    for (const entry of categoryEntries) {
      const prefix = entry.date ? `[${entry.date}] ` : "";
      sections.push(`- ${prefix}${entry.content}`);
    }
    sections.push("");
  }

  return sections.join("\n").trim();
}

export async function appendStructuredEntry(entry: StructuredEntry): Promise<void> {
  const existing = await readMemory();
  const header = SECTION_HEADERS[entry.category];
  const date = entry.date ?? new Date().toISOString().slice(0, 10);
  const bullet = entry.category === "decisions"
    ? `- [${date}] ${entry.content}`
    : `- ${entry.content}`;

  if (existing.includes(header)) {
    // Find the section and append after the last bullet in it
    const lines = existing.split("\n");
    const headerIdx = lines.findIndex((l) => l.trim() === header);
    let insertIdx = headerIdx + 1;

    // Find last bullet line in this section
    for (let i = headerIdx + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) break; // next section
      if (/^[-*]\s/.test(lines[i])) insertIdx = i + 1;
    }

    lines.splice(insertIdx, 0, bullet);
    await writeMemory(lines.join("\n"));
  } else {
    // Section doesn't exist — append at end
    const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n\n" : existing.length > 0 ? "\n" : "";
    await writeMemory(`${existing}${separator}${header}\n${bullet}\n`);
  }
}
