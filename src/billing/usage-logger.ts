import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { usageLog } from "../db/schema.js";
import { calculateCost } from "./pricing.js";

export interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  chatId: string;
}

export function logUsage(dbUrl: string, record: UsageRecord): void {
  const db = getDb(dbUrl);
  db.insert(usageLog).values({
    id: randomUUID(),
    timestamp: new Date(),
    model: record.model,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    costUsd: record.costUsd.toFixed(6),
    chatId: record.chatId,
  }).run();
}

export function getDailyUsage(dbUrl: string, date?: string): {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  records: number;
} {
  const db = getDb(dbUrl);
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  // Convert date to start/end timestamps (Unix seconds)
  const startMs = new Date(`${targetDate}T00:00:00.000Z`).getTime();
  const endMs = startMs + 86_400_000; // +24h

  // Drizzle stores timestamp as Unix seconds (mode: "timestamp")
  const startSec = Math.floor(startMs / 1000);
  const endSec = Math.floor(endMs / 1000);

  const rows = db
    .select({
      totalCost: sql<string>`COALESCE(SUM(CAST(${usageLog.costUsd} AS REAL)), 0)`,
      totalInput: sql<number>`COALESCE(SUM(${usageLog.inputTokens}), 0)`,
      totalOutput: sql<number>`COALESCE(SUM(${usageLog.outputTokens}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(usageLog)
    .where(sql`${usageLog.timestamp} >= ${startSec} AND ${usageLog.timestamp} < ${endSec}`)
    .all();

  const row = rows[0];
  return {
    totalCostUsd: Number(row?.totalCost ?? 0),
    totalInputTokens: Number(row?.totalInput ?? 0),
    totalOutputTokens: Number(row?.totalOutput ?? 0),
    records: Number(row?.count ?? 0),
  };
}

export function checkBudget(dbUrl: string, maxDailyBudgetUsd: number): {
  spent: number;
  remaining: number;
  percentage: number;
} {
  const { totalCostUsd } = getDailyUsage(dbUrl);
  const remaining = Math.max(0, maxDailyBudgetUsd - totalCostUsd);
  const percentage = maxDailyBudgetUsd > 0
    ? (totalCostUsd / maxDailyBudgetUsd) * 100
    : 0;
  return { spent: totalCostUsd, remaining, percentage };
}
