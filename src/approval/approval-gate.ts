import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { RiskLevel, type Classification } from "./risk-classifier.js";
import { pendingApprovals } from "../db/schema.js";
import type { getDb } from "../db/client.js";

export interface PendingApproval {
  id: string;
  nonce: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  classification: Classification;
  createdAt: Date;
  resolve: (approved: boolean) => void;
}

const pending = new Map<string, PendingApproval>();

let db: ReturnType<typeof getDb> | null = null;

export function setApprovalDb(dbInstance: typeof db): void {
  db = dbInstance;
}

export function createApproval(
  toolName: string,
  toolArgs: Record<string, unknown>,
  classification: Classification,
  timeoutMs?: number,
  conversationId: string = "default",
): { nonce: string; promise: Promise<boolean> } {
  const nonce = randomBytes(4).toString("hex");
  const id = randomBytes(8).toString("hex");
  let resolve!: (approved: boolean) => void;

  const promise = new Promise<boolean>((res) => {
    resolve = res;
  });

  const now = new Date();

  const approval: PendingApproval = {
    id,
    nonce,
    toolName,
    toolArgs,
    classification,
    createdAt: now,
    resolve,
  };

  pending.set(nonce, approval);

  // Persist to DB (fire-and-forget, audit only)
  if (db) {
    try {
      db.insert(pendingApprovals).values({
        id,
        conversationId,
        toolName,
        toolArgs: JSON.stringify(toolArgs),
        riskLevel: classification.level,
        status: "pending",
        nonce,
        createdAt: now,
      }).run();
    } catch (_) {
      // DB write is supplementary — do not block approval flow
    }
  }

  if (timeoutMs && timeoutMs > 0) {
    const timer = setTimeout(() => {
      if (pending.has(nonce)) {
        pending.delete(nonce);
        resolve(false);
        // Update DB row to timeout status
        if (db) {
          try {
            db.update(pendingApprovals)
              .set({ status: "timeout", resolvedAt: new Date() })
              .where(eq(pendingApprovals.nonce, nonce))
              .run();
          } catch (_) {
            // fire-and-forget
          }
        }
      }
    }, timeoutMs);
    // Wrap resolve to clear timeout on manual resolution
    const manualResolve = approval.resolve;
    approval.resolve = (approved: boolean) => {
      clearTimeout(timer);
      manualResolve(approved);
    };
  }

  return { nonce, promise };
}

export function resolveApproval(nonce: string, approved: boolean): boolean {
  const approval = pending.get(nonce);
  if (!approval) return false;
  pending.delete(nonce);
  approval.resolve(approved);

  // Update DB row (fire-and-forget, audit only)
  if (db) {
    try {
      db.update(pendingApprovals)
        .set({
          status: approved ? "approved" : "denied",
          resolvedAt: new Date(),
        })
        .where(eq(pendingApprovals.nonce, nonce))
        .run();
    } catch (_) {
      // fire-and-forget
    }
  }

  return true;
}

export function getPending(nonce: string): PendingApproval | undefined {
  return pending.get(nonce);
}

export function rejectAllPending(reason: string): void {
  const nonces = [...pending.keys()];

  for (const [nonce, approval] of pending) {
    approval.resolve(false);
    pending.delete(nonce);
  }

  // Bulk update all pending rows to denied (fire-and-forget)
  if (db && nonces.length > 0) {
    try {
      for (const nonce of nonces) {
        db.update(pendingApprovals)
          .set({ status: "denied", resolvedAt: new Date() })
          .where(eq(pendingApprovals.nonce, nonce))
          .run();
      }
    } catch (_) {
      // fire-and-forget
    }
  }
}

export function pendingCount(): number {
  return pending.size;
}
