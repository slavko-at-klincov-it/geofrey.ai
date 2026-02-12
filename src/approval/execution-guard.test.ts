import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkExecution } from "./execution-guard.js";
import { createApproval, rejectAllPending } from "./approval-gate.js";
import { RiskLevel, type Classification } from "./risk-classifier.js";

const make = (level: RiskLevel): Classification => ({
  level,
  reason: "test",
  deterministic: true,
});

describe("checkExecution", () => {
  beforeEach(() => rejectAllPending("cleanup"));

  it("L3 always blocked", () => {
    const r = checkExecution(undefined, make(RiskLevel.L3));
    assert.equal(r.allowed, false);
  });

  it("L0 always allowed", () => {
    const r = checkExecution(undefined, make(RiskLevel.L0));
    assert.equal(r.allowed, true);
  });

  it("L1 always allowed", () => {
    const r = checkExecution(undefined, make(RiskLevel.L1));
    assert.equal(r.allowed, true);
  });

  it("L2 with pending nonce is blocked", () => {
    const { nonce } = createApproval("test", {}, make(RiskLevel.L2));
    const r = checkExecution(nonce, make(RiskLevel.L2));
    assert.equal(r.allowed, false);
  });

  it("L2 without nonce is allowed", () => {
    const r = checkExecution(undefined, make(RiskLevel.L2));
    assert.equal(r.allowed, true);
  });
});
