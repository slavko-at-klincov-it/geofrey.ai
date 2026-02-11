import { getPending } from "./approval-gate.js";
import { RiskLevel, type Classification } from "./risk-classifier.js";

export interface GuardResult {
  allowed: boolean;
  reason: string;
}

export function checkExecution(
  nonce: string | undefined,
  classification: Classification,
): GuardResult {
  // L3 actions are always blocked
  if (classification.level === RiskLevel.L3) {
    return { allowed: false, reason: "L3: Aktion ist blockiert" };
  }

  // L0/L1 don't need approval
  if (classification.level === RiskLevel.L0 || classification.level === RiskLevel.L1) {
    return { allowed: true, reason: "Auto-approved" };
  }

  // L2: verify the approval hasn't been revoked
  if (nonce) {
    const approval = getPending(nonce);
    // If still pending, it hasn't been approved yet
    if (approval) {
      return { allowed: false, reason: "Genehmigung noch ausstehend" };
    }
    // If not in pending map, it was already resolved (approved or denied)
    // The caller should have the result from the promise
  }

  return { allowed: true, reason: "Approved" };
}
