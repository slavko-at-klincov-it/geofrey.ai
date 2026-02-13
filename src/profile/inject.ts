import type { Profile } from "./schema.js";

export function buildProfileContext(profile: Profile): string {
  const lines: string[] = [
    "<user_profile>",
    `  <name>${profile.name}</name>`,
    `  <timezone>${profile.timezone}</timezone>`,
    `  <communication_style>${profile.communicationStyle}</communication_style>`,
  ];

  if (profile.workDirectory) {
    lines.push(`  <work_directory>${profile.workDirectory}</work_directory>`);
  }

  if (profile.interests.length > 0) {
    lines.push(`  <interests>${profile.interests.join(", ")}</interests>`);
  }

  lines.push(`  <calendar_provider>${profile.calendarApp.provider}</calendar_provider>`);
  lines.push(`  <notes_provider>${profile.notesApp.provider}</notes_provider>`);
  lines.push(`  <task_provider>${profile.taskApp.provider}</task_provider>`);

  if (profile.morningBrief.enabled) {
    lines.push(`  <morning_brief time="${profile.morningBrief.time}" />`);
  }

  lines.push("</user_profile>");
  return lines.join("\n");
}
