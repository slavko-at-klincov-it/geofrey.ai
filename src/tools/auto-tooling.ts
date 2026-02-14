import { registerTool } from "./tool-registry.js";
import { detectCapabilityGap, formatProposal } from "../auto-tooling/detector.js";
import { collectContext } from "../auto-tooling/context-collector.js";
import { buildProjectClaudeMd } from "../auto-tooling/claude-md-generator.js";
import { buildAutoToolPrompt } from "../auto-tooling/prompt-builder.js";
import { launchBuild, projectSlug, projectPath } from "../auto-tooling/launcher.js";
import { validateBuild } from "../auto-tooling/validator.js";
import { registerAutoTool } from "../auto-tooling/registrar.js";
import { t } from "../i18n/index.js";

let activeChatId = "";

export function setAutoToolingChatId(chatId: string): void {
  activeChatId = chatId;
}

registerTool({
  name: "auto_tooling",
  description: "Build a standalone program when no existing tool can handle the task. Detects capability gaps, collects requirements, generates code via Claude Code in isolation, validates the result, and registers it as a cron job or background process.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["detect_gap", "build", "validate", "register"],
        description: "Action to perform",
      },
      request: { type: "string", description: "User's original request" },
      requirements: {
        type: "array",
        items: { type: "string" },
        description: "Clarified requirements",
      },
      projectDir: { type: "string", description: "Project directory (for validate/register)" },
      outputType: {
        type: "string",
        enum: ["cron_job", "background_process", "one_shot"],
        description: "How to register the tool",
      },
      schedule: { type: "string", description: "Cron schedule (for cron_job type)" },
    },
    required: ["action"],
  },
  execute: async (args: Record<string, unknown>) => {
    const action = args.action as string;

    switch (action) {
      case "detect_gap": {
        const request = (args.request as string) ?? "";
        const gap = detectCapabilityGap(request);
        if (gap.hasGap) {
          return formatProposal(gap);
        }
        return "No capability gap detected — existing tools should handle this.";
      }

      case "build": {
        const request = (args.request as string) ?? "";
        const requirements = (args.requirements as string[]) ?? [];

        // Collect context
        const context = await collectContext(request, requirements);
        const slug = projectSlug(request.slice(0, 50));
        const dir = projectPath(slug);

        // Generate CLAUDE.md
        const claudeMd = await buildProjectClaudeMd(
          slug,
          context.taskDescription,
          context.requirements,
          context.constraints,
          context.techStack,
        );

        // Build prompt
        const { prompt, systemPrompt, flags } = buildAutoToolPrompt(context, dir, claudeMd);

        // Launch build
        const result = await launchBuild({
          projectDir: dir,
          projectName: slug,
          claudeMdContent: claudeMd,
          prompt,
          systemPrompt,
          flags,
          timeoutMs: 30 * 60 * 1000,
        });

        if (result.success) {
          // Validate
          const validation = await validateBuild(dir);
          return `Build complete (${Math.round(result.durationMs / 1000)}s). Validation: ${validation.summary}. Project: ${dir}`;
        }
        return `Build failed (exit ${result.exitCode}): ${result.error ?? result.output.slice(0, 500)}`;
      }

      case "validate": {
        const dir = (args.projectDir as string) ?? "";
        if (!dir) return "Error: projectDir required";
        const validation = await validateBuild(dir);
        const details = validation.checks.map((c) => `${c.passed ? "✓" : "✗"} ${c.name}: ${c.detail}`).join("\n");
        return `${validation.summary}\n${details}`;
      }

      case "register": {
        const dir = (args.projectDir as string) ?? "";
        const outputType = (args.outputType as "cron_job" | "background_process" | "one_shot") ?? "one_shot";
        const schedule = args.schedule as string | undefined;
        const chatId = activeChatId;
        if (!dir) return "Error: projectDir required";
        const reg = registerAutoTool(dir, outputType, chatId, schedule);
        return `Registered as ${reg.type}: ${reg.detail}`;
      }

      default:
        return `Unknown action: ${action}. Use detect_gap, build, validate, or register.`;
    }
  },
});
