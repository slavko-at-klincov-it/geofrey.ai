import { input, password, select, confirm } from "@inquirer/prompts";

export async function askText(message: string, defaultValue?: string): Promise<string> {
  return input({ message, default: defaultValue });
}

export async function askSecret(message: string): Promise<string> {
  return password({ message, mask: "*" });
}

export async function askYesNo(message: string, defaultValue = true): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}

export interface Choice<T> {
  name: string;
  value: T;
  description?: string;
}

export async function askChoice<T>(message: string, choices: Choice<T>[]): Promise<T> {
  return select({ message, choices });
}
