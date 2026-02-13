import { randomBytes } from "node:crypto";
import { RiskLevel, type Classification } from "./risk-classifier.js";

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

export function createApproval(
  toolName: string,
  toolArgs: Record<string, unknown>,
  classification: Classification,
  timeoutMs?: number,
): { nonce: string; promise: Promise<boolean> } {
  const nonce = randomBytes(4).toString("hex");
  let resolve!: (approved: boolean) => void;

  const promise = new Promise<boolean>((res) => {
    resolve = res;
  });

  const approval: PendingApproval = {
    id: randomBytes(8).toString("hex"),
    nonce,
    toolName,
    toolArgs,
    classification,
    createdAt: new Date(),
    resolve,
  };

  pending.set(nonce, approval);

  if (timeoutMs && timeoutMs > 0) {
    const timer = setTimeout(() => {
      if (pending.has(nonce)) {
        pending.delete(nonce);
        resolve(false);
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
  return true;
}

export function getPending(nonce: string): PendingApproval | undefined {
  return pending.get(nonce);
}

export function rejectAllPending(reason: string): void {
  for (const [nonce, approval] of pending) {
    approval.resolve(false);
    pending.delete(nonce);
  }
}

export function pendingCount(): number {
  return pending.size;
}
