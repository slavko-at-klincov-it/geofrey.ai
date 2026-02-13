import type { Skill } from "./registry.js";

export function buildSkillContext(skills: Skill[]): string {
  const enabled = skills.filter((s) => s.enabled);
  if (enabled.length === 0) return "";

  const entries = enabled.map((s) => {
    const emojiAttr = s.frontmatter.emoji ? ` emoji="${s.frontmatter.emoji}"` : "";
    return `<skill name="${s.id}"${emojiAttr}>\nDescription: ${s.frontmatter.description}\nInstructions:\n${s.instructions}\n</skill>`;
  });

  return `<skills>\n${entries.join("\n")}\n</skills>`;
}
