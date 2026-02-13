import { t } from "../i18n/index.js";

export interface BudgetAlert {
  percentage: number; // 50, 75, or 90
  message: string;
}

// Track which thresholds have been alerted today (reset daily)
let alertedThresholds = new Set<number>();

const THRESHOLDS = [90, 75, 50] as const;

export function checkBudgetThresholds(spent: number, limit: number): BudgetAlert | null {
  if (limit <= 0) return null;
  const pct = (spent / limit) * 100;

  for (const threshold of THRESHOLDS) {
    if (pct >= threshold && !alertedThresholds.has(threshold)) {
      alertedThresholds.add(threshold);

      const message = pct >= 100
        ? t("billing.budgetExceeded", { spent: spent.toFixed(4), limit: limit.toFixed(2) })
        : t("billing.budgetWarning", { pct: String(threshold), spent: spent.toFixed(4), limit: limit.toFixed(2) });

      return { percentage: threshold, message };
    }
  }
  return null;
}

export function resetDailyAlerts(): void {
  alertedThresholds = new Set<number>();
}
