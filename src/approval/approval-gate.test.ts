import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createApproval, resolveApproval, rejectAllPending, pendingCount } from "./approval-gate.js";
import { RiskLevel } from "./risk-classifier.js";

const classification = { level: RiskLevel.L2, reason: "test", deterministic: true };

describe("createApproval", () => {
  beforeEach(() => rejectAllPending("cleanup"));

  it("returns nonce and promise", () => {
    const { nonce, promise } = createApproval("delete_file", { path: "/tmp/a" }, classification);
    assert.equal(typeof nonce, "string");
    assert.equal(nonce.length, 8);
    assert.ok(promise instanceof Promise);
  });

  it("increments pendingCount", () => {
    const before = pendingCount();
    createApproval("delete_file", {}, classification);
    assert.equal(pendingCount(), before + 1);
  });
});

describe("resolveApproval", () => {
  beforeEach(() => rejectAllPending("cleanup"));

  it("approve resolves true", async () => {
    const { nonce, promise } = createApproval("delete_file", {}, classification);
    const resolved = resolveApproval(nonce, true);
    assert.equal(resolved, true);
    assert.equal(await promise, true);
  });

  it("deny resolves false", async () => {
    const { nonce, promise } = createApproval("delete_file", {}, classification);
    const resolved = resolveApproval(nonce, false);
    assert.equal(resolved, true);
    assert.equal(await promise, false);
  });

  it("invalid nonce returns false", () => {
    assert.equal(resolveApproval("nonexistent", true), false);
  });

  it("double resolve returns false", () => {
    const { nonce } = createApproval("delete_file", {}, classification);
    resolveApproval(nonce, true);
    assert.equal(resolveApproval(nonce, true), false);
  });
});

describe("rejectAllPending", () => {
  beforeEach(() => rejectAllPending("cleanup"));

  it("resolves all pending as false and clears map", async () => {
    const a = createApproval("a", {}, classification);
    const b = createApproval("b", {}, classification);
    rejectAllPending("shutdown");
    assert.equal(await a.promise, false);
    assert.equal(await b.promise, false);
    assert.equal(pendingCount(), 0);
  });
});
