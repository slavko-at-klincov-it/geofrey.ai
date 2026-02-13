import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkBudgetThresholds, resetDailyAlerts } from "./budget-monitor.js";

describe("budget-monitor", () => {
  beforeEach(() => {
    resetDailyAlerts();
  });

  describe("checkBudgetThresholds", () => {
    it("returns alert at 50% threshold", () => {
      const alert = checkBudgetThresholds(5.0, 10.0);
      assert.ok(alert);
      assert.equal(alert.percentage, 50);
      assert.ok(alert.message.includes("50%"));
    });

    it("returns alert at 75% threshold", () => {
      const alert = checkBudgetThresholds(7.5, 10.0);
      assert.ok(alert);
      // Should trigger 75% first (highest matching un-alerted)
      assert.equal(alert.percentage, 75);
    });

    it("returns alert at 90% threshold", () => {
      const alert = checkBudgetThresholds(9.5, 10.0);
      assert.ok(alert);
      assert.equal(alert.percentage, 90);
    });

    it("does not alert same threshold twice", () => {
      const first = checkBudgetThresholds(5.0, 10.0);
      assert.ok(first);
      assert.equal(first.percentage, 50);

      // Same spending level, same threshold should not alert again
      const second = checkBudgetThresholds(5.5, 10.0);
      assert.equal(second, null);
    });

    it("alerts progressive thresholds", () => {
      const alert50 = checkBudgetThresholds(5.0, 10.0);
      assert.ok(alert50);
      assert.equal(alert50.percentage, 50);

      const alert75 = checkBudgetThresholds(7.5, 10.0);
      assert.ok(alert75);
      assert.equal(alert75.percentage, 75);

      const alert90 = checkBudgetThresholds(9.5, 10.0);
      assert.ok(alert90);
      assert.equal(alert90.percentage, 90);
    });

    it("returns null when under all thresholds", () => {
      const alert = checkBudgetThresholds(1.0, 10.0);
      assert.equal(alert, null);
    });

    it("returns null when limit is zero", () => {
      const alert = checkBudgetThresholds(5.0, 0);
      assert.equal(alert, null);
    });

    it("returns null when limit is negative", () => {
      const alert = checkBudgetThresholds(5.0, -1);
      assert.equal(alert, null);
    });

    it("uses exceeded message when over 100%", () => {
      const alert = checkBudgetThresholds(11.0, 10.0);
      assert.ok(alert);
      assert.equal(alert.percentage, 90);
      // Over 100% should use the "exceeded" message
      assert.ok(alert.message.includes("$11.0000"));
    });
  });

  describe("resetDailyAlerts", () => {
    it("clears all alerted thresholds", () => {
      // Trigger all thresholds one by one (each call returns the highest un-alerted)
      checkBudgetThresholds(9.5, 10.0); // triggers 90
      checkBudgetThresholds(9.5, 10.0); // triggers 75
      checkBudgetThresholds(9.5, 10.0); // triggers 50
      const noAlert = checkBudgetThresholds(9.5, 10.0);
      assert.equal(noAlert, null);

      // Reset
      resetDailyAlerts();

      // Should alert again after reset
      const alert = checkBudgetThresholds(9.5, 10.0);
      assert.ok(alert);
      assert.equal(alert.percentage, 90);
    });
  });
});
