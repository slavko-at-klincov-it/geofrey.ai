/**
 * Context collected about the auto-tooling task.
 * Defined here until context-collector.ts is implemented.
 */
export interface AutoToolContext {
  taskDescription: string;
  requirements: string[];
  constraints: string[];
  techStack: string[];
  userDoesntWant: string[];
}

export interface AutoToolPrompt {
  prompt: string;
  systemPrompt: string;
  flags: string[];
}

/**
 * Builds the full prompt + flags for invoking Claude Code to generate a program.
 */
export function buildAutoToolPrompt(
  context: AutoToolContext,
  projectDir: string,
  claudeMdContent: string,
): AutoToolPrompt {
  const taskLines: string[] = [];

  taskLines.push("You are building a standalone program that will run autonomously.");
  taskLines.push("");
  taskLines.push(`## Task`);
  taskLines.push(context.taskDescription);
  taskLines.push("");

  if (context.requirements.length > 0) {
    taskLines.push("## Requirements");
    for (const req of context.requirements) {
      taskLines.push(`- ${req}`);
    }
    taskLines.push("");
  }

  taskLines.push("## Tech Stack");
  for (const tech of context.techStack) {
    taskLines.push(`- ${tech}`);
  }
  taskLines.push("");

  taskLines.push("## Constraints");
  for (const c of context.constraints) {
    taskLines.push(`- ${c}`);
  }
  taskLines.push("");

  taskLines.push("## Expected Output");
  taskLines.push("1. Create a working program in this directory");
  taskLines.push("2. Include a package.json with start script");
  taskLines.push("3. Include basic error handling and logging");
  taskLines.push("4. Write at least one test file");
  taskLines.push("5. Make sure `npm test` passes before finishing");
  taskLines.push("6. The program must handle SIGTERM gracefully");
  taskLines.push("");

  if (context.userDoesntWant.length > 0) {
    taskLines.push("## What NOT to do");
    for (const d of context.userDoesntWant) {
      taskLines.push(`- ${d}`);
    }
    taskLines.push("");
  }

  const prompt = taskLines.join("\n");

  const systemPrompt = [
    "You are building a standalone autonomous program.",
    "Follow the CLAUDE.md in the project directory for conventions and constraints.",
    "Write production-quality code. Include tests. Handle errors.",
    "Do NOT commit to git. Do NOT push anything. Do NOT install global packages.",
    "Focus on making the program work correctly and handle edge cases.",
  ].join(" ");

  const flags: string[] = [
    "--dangerously-skip-permissions",
    "--output-format", "stream-json",
    "--max-turns", "50",
  ];

  return { prompt, systemPrompt, flags };
}

/**
 * Builds the enrichment prompt for Claude Code to add tech conventions to CLAUDE.md.
 */
export function buildEnrichmentPrompt(projectDir: string): string {
  return [
    "Review the code in this project and update CLAUDE.md with:",
    "1. Architecture section describing the file structure",
    "2. Conventions section based on patterns you see in the code",
    "3. Any dependencies or environment requirements",
    "Keep existing sections (Overview, Requirements, What We Don't Want) unchanged.",
    "Only ADD new sections, don't modify existing ones.",
  ].join("\n");
}
