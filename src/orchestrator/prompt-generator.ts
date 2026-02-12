// Task templates for downstream models (Claude Code, etc.)
// These are code-based templates, not LLM-generated prompts.

import { RiskLevel } from "../approval/risk-classifier.js";
import type { Config } from "../config/schema.js";

export interface TaskTemplate {
  context: string;
  task: string;
  constraints: string[];
  respondWith: string;
}

export interface ClaudeCodePrompt {
  prompt: string;
  allowedTools: string;
  systemPrompt: string;
}

const templates: Record<string, (args: Record<string, string>) => TaskTemplate> = {
  bug_fix: ({ error, files }) => ({
    context: `Error: ${error}\nAffected files: ${files}`,
    task: `Fix the bug causing the error above.`,
    constraints: [
      "Don't commit",
      "Don't modify unrelated files",
      "Use existing dependencies only",
    ],
    respondWith: "Diff of changes + one-line explanation",
  }),

  refactor: ({ targetPattern, files }) => ({
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

  code_review: ({ files, focus }) => ({
    context: `Files to review: ${files}`,
    task: `Review the code${focus ? ` focusing on: ${focus}` : ""}.`,
    constraints: [
      "Don't modify any files",
      "Focus on bugs, security issues, and code quality",
    ],
    respondWith: "List of findings with file:line references",
  }),

  test_writing: ({ files, framework }) => ({
    context: `Files to test: ${files}\nTest framework: ${framework || "auto-detect"}`,
    task: `Write tests for the specified files.`,
    constraints: [
      "Follow existing test patterns",
      "Don't commit",
      "Don't modify source files",
    ],
    respondWith: "New test files + summary of coverage",
  }),

  debugging: ({ error, files, steps }) => ({
    context: `Error: ${error}\nFiles: ${files}${steps ? `\nRepro steps: ${steps}` : ""}`,
    task: `Investigate and fix the bug.`,
    constraints: [
      "Don't commit",
      "Explain root cause before fixing",
      "Use existing dependencies only",
    ],
    respondWith: "Root cause analysis + fix diff",
  }),

  documentation: ({ files, scope }) => ({
    context: `Files: ${files}\nScope: ${scope || "inline docs + README"}`,
    task: `Add or update documentation.`,
    constraints: [
      "Don't change code logic",
      "Don't commit",
      "Follow existing doc style",
    ],
    respondWith: "Updated files + summary of changes",
  }),

  freeform: ({ request, files }) => ({
    context: files ? `Related files: ${files}` : "",
    task: request,
    constraints: [
      "Don't commit",
      "Be concise in explanations",
    ],
    respondWith: "Result + brief explanation",
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

/**
 * Map risk level to tool profile for Claude Code's --allowedTools.
 */
export function scopeToolsForRisk(
  level: RiskLevel,
  toolProfiles: Config["claude"]["toolProfiles"],
): string {
  switch (level) {
    case RiskLevel.L0:
      return toolProfiles.readOnly;
    case RiskLevel.L1:
      return toolProfiles.standard;
    case RiskLevel.L2:
    case RiskLevel.L3:
      return toolProfiles.full;
  }
}

/**
 * Build a structured prompt for Claude Code invocation.
 */
export function buildClaudeCodePrompt(task: {
  intent: string;
  request: string;
  files?: string;
  error?: string;
  riskLevel?: RiskLevel;
  toolProfiles?: Config["claude"]["toolProfiles"];
}): ClaudeCodePrompt {
  const {
    intent,
    request,
    files,
    error,
    riskLevel = RiskLevel.L1,
    toolProfiles = { readOnly: "Read Glob Grep", standard: "Read Glob Grep Edit Write Bash(git:*)", full: "Read Glob Grep Edit Write Bash" },
  } = task;

  // Select template based on intent
  let templateName = "freeform";
  if (error && intent === "debugging") templateName = "debugging";
  else if (intent === "bug_fix" || intent === "fix") templateName = "bug_fix";
  else if (intent === "refactor") templateName = "refactor";
  else if (intent === "new_feature" || intent === "feature") templateName = "new_feature";
  else if (intent === "code_review" || intent === "review") templateName = "code_review";
  else if (intent === "test_writing" || intent === "test") templateName = "test_writing";
  else if (intent === "documentation" || intent === "docs") templateName = "documentation";

  const prompt = generatePrompt(templateName, {
    request,
    error: error ?? "",
    files: files ?? "",
    requirements: request,
    existingPatterns: "",
    targetPattern: "",
    focus: "",
    framework: "",
    steps: "",
    scope: "",
  });

  const allowedTools = scopeToolsForRisk(riskLevel, toolProfiles);

  const systemPrompt = "You are working on a TypeScript project. Follow existing patterns. Don't commit changes.";

  return { prompt, allowedTools, systemPrompt };
}
