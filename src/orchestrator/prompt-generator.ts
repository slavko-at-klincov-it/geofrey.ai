// Task templates for downstream models (Claude Code, etc.)
// These are code-based templates, not LLM-generated prompts.

export interface TaskTemplate {
  context: string;
  task: string;
  constraints: string[];
  respondWith: string;
}

const templates: Record<string, (args: Record<string, string>) => TaskTemplate> = {
  bug_fix: ({ error, files, expected }) => ({
    context: `Error: ${error}\nAffected files: ${files}`,
    task: `Fix the bug causing the error above.`,
    constraints: [
      "Don't commit",
      "Don't modify unrelated files",
      "Use existing dependencies only",
    ],
    respondWith: "Diff of changes + one-line explanation",
  }),

  refactor: ({ currentCode, targetPattern, files }) => ({
    context: `Current code: ${files}\nTarget pattern: ${targetPattern}`,
    task: `Refactor to match the target pattern.`,
    constraints: [
      "Don't change public API",
      "Don't commit",
      "Preserve existing tests",
    ],
    respondWith: "Diff of changes + explanation of what changed and why",
  }),

  new_feature: ({ requirements, existingPatterns, files }) => ({
    context: `Requirements: ${requirements}\nExisting patterns: ${existingPatterns}\nRelated files: ${files}`,
    task: `Implement the feature described in the requirements.`,
    constraints: [
      "Follow existing code patterns",
      "Don't commit",
      "Add tests if test framework is set up",
    ],
    respondWith: "New/modified files + explanation",
  }),
};

export function generatePrompt(
  templateName: string,
  args: Record<string, string>,
): string {
  const template = templates[templateName];
  if (!template) {
    return `Task: ${JSON.stringify(args)}`;
  }

  const { context, task, constraints, respondWith } = template(args);
  return [
    `<context>\n${context}\n</context>`,
    `<task>\n${task}\n</task>`,
    `<constraints>\n${constraints.map((c) => `- ${c}`).join("\n")}\n</constraints>`,
    `<respond_with>\n${respondWith}\n</respond_with>`,
  ].join("\n");
}
