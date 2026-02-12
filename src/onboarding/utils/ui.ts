import chalk from "chalk";
import ora, { type Ora } from "ora";
import { t } from "../../i18n/index.js";

export function banner(): void {
  console.log(chalk.bold.cyan(`\n  ${t("onboarding.banner")}\n`));
}

export function stepHeader(num: number, title: string): void {
  console.log(chalk.bold(`\n── ${t("onboarding.stepLabel", { num: String(num), title })} ──\n`));
}

export function success(msg: string): void {
  console.log(chalk.green(`  ✓ ${msg}`));
}

export function warn(msg: string): void {
  console.log(chalk.yellow(`  ⚠ ${msg}`));
}

export function fail(msg: string): void {
  console.log(chalk.red(`  ✗ ${msg}`));
}

export function info(msg: string): void {
  console.log(chalk.gray(`    ${msg}`));
}

export function spinner(text: string): Ora {
  return ora({ text, indent: 2 }).start();
}

export function box(lines: string[]): void {
  const maxLen = Math.max(...lines.map((l) => l.length));
  const pad = (s: string) => s + " ".repeat(maxLen - s.length);
  console.log(chalk.gray(`\n┌${"─".repeat(maxLen + 2)}┐`));
  for (const line of lines) {
    console.log(chalk.gray("│ ") + pad(line) + chalk.gray(" │"));
  }
  console.log(chalk.gray(`└${"─".repeat(maxLen + 2)}┘`));
}
