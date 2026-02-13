import { searchMemory, type OllamaConfig } from "./embeddings.js";

const CONFLICT_THRESHOLD = 0.75;

const NEGATION_PATTERNS = /\b(nicht|never|don't|doesn't|dont|doesnt|removed|rejected|blocked|refused|forbidden|verboten|abgelehnt|entfernt|kein|keine|no\s)\b/i;

export interface ConflictResult {
  found: boolean;
  memoryContent?: string;
  similarity?: number;
}

function describeAction(toolName: string, toolArgs: Record<string, unknown>): string {
  const parts = [toolName];
  if (typeof toolArgs.command === "string") parts.push(toolArgs.command);
  if (typeof toolArgs.path === "string") parts.push(toolArgs.path);
  if (typeof toolArgs.action === "string") parts.push(toolArgs.action);
  if (typeof toolArgs.name === "string") parts.push(toolArgs.name);
  return parts.join(" ");
}

export async function checkDecisionConflict(
  toolName: string,
  toolArgs: Record<string, unknown>,
  config: OllamaConfig,
  dbUrl?: string,
): Promise<ConflictResult> {
  const description = describeAction(toolName, toolArgs);
  const results = await searchMemory(description, config, 5, dbUrl);

  for (const result of results) {
    if (result.similarity < CONFLICT_THRESHOLD) continue;
    if (!NEGATION_PATTERNS.test(result.content)) continue;

    return {
      found: true,
      memoryContent: result.content,
      similarity: result.similarity,
    };
  }

  return { found: false };
}
