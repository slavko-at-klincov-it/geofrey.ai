import { RiskLevel } from "./risk-classifier.js";

export interface ActionDefinition {
  name: string;
  description: string;
  defaultLevel: RiskLevel;
  escalationPatterns?: RegExp[];
}

const registry = new Map<string, ActionDefinition>();

export function registerAction(action: ActionDefinition): void {
  registry.set(action.name, action);
}

export function getAction(name: string): ActionDefinition | undefined {
  return registry.get(name);
}

export function getAllActions(): ActionDefinition[] {
  return Array.from(registry.values());
}

// Register built-in actions
registerAction({ name: "read_file", description: "Read a file", defaultLevel: RiskLevel.L0 });
registerAction({ name: "list_dir", description: "List directory contents", defaultLevel: RiskLevel.L0 });
registerAction({ name: "search", description: "Search files", defaultLevel: RiskLevel.L0 });
registerAction({ name: "write_file", description: "Write/edit a file", defaultLevel: RiskLevel.L1 });
registerAction({ name: "delete_file", description: "Delete a file", defaultLevel: RiskLevel.L2 });
registerAction({ name: "shell_exec", description: "Execute shell command", defaultLevel: RiskLevel.L2 });
registerAction({ name: "git_commit", description: "Git commit", defaultLevel: RiskLevel.L2 });
registerAction({ name: "git_push", description: "Git push", defaultLevel: RiskLevel.L2 });
