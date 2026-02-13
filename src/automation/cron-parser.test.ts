import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCron, getNextRun } from "./cron-parser.js";

describe("parseCron", () => {
  it("parses * * * * * (every minute)", () => {
    const cron = parseCron("* * * * *");
    assert.equal(cron.minute.values.length, 60); // 0-59
    assert.equal(cron.hour.values.length, 24);
    assert.equal(cron.dom.values.length, 31);
    assert.equal(cron.month.values.length, 12);
    assert.equal(cron.dow.values.length, 7);
  });

  it("parses specific values: 0 9 * * *", () => {
    const cron = parseCron("0 9 * * *");
    assert.deepEqual(cron.minute.values, [0]);
    assert.deepEqual(cron.hour.values, [9]);
  });

  it("parses step values: */5 * * * *", () => {
    const cron = parseCron("*/5 * * * *");
    assert.deepEqual(cron.minute.values, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it("parses ranges: 0 9-17 * * *", () => {
    const cron = parseCron("0 9-17 * * *");
    assert.deepEqual(cron.minute.values, [0]);
    assert.deepEqual(cron.hour.values, [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it("parses comma-separated: 0,15,30,45 * * * *", () => {
    const cron = parseCron("0,15,30,45 * * * *");
    assert.deepEqual(cron.minute.values, [0, 15, 30, 45]);
  });

  it("parses range with step: 1-10/3 * * * *", () => {
    const cron = parseCron("1-10/3 * * * *");
    assert.deepEqual(cron.minute.values, [1, 4, 7, 10]);
  });

  it("parses day of week: 0 9 * * 1-5", () => {
    const cron = parseCron("0 9 * * 1-5");
    assert.deepEqual(cron.dow.values, [1, 2, 3, 4, 5]);
  });

  it("parses complex: 5,10 */2 1,15 * 0,6", () => {
    const cron = parseCron("5,10 */2 1,15 * 0,6");
    assert.deepEqual(cron.minute.values, [5, 10]);
    assert.deepEqual(cron.hour.values, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
    assert.deepEqual(cron.dom.values, [1, 15]);
    assert.deepEqual(cron.dow.values, [0, 6]);
  });

  it("throws on invalid field count", () => {
    assert.throws(() => parseCron("* * *"), /Expected 5 fields/);
  });

  it("throws on invalid value", () => {
    assert.throws(() => parseCron("60 * * * *"), /must be 0-59/);
  });

  it("throws on invalid range", () => {
    assert.throws(() => parseCron("* 25 * * *"), /must be 0-23/);
  });

  it("throws on reversed range", () => {
    assert.throws(() => parseCron("10-5 * * * *"), /Invalid range/);
  });
});

describe("getNextRun", () => {
  it("returns next minute for * * * * *", () => {
    const now = new Date("2026-03-01T10:30:00Z");
    const next = getNextRun("* * * * *", now);
    assert.equal(next.getTime(), new Date("2026-03-01T10:31:00Z").getTime());
  });

  it("returns correct next run for 0 9 * * *", () => {
    const now = new Date("2026-03-01T10:00:00Z");
    const next = getNextRun("0 9 * * *", now);
    // Next 9:00 AM is the following day
    assert.equal(next.getUTCHours(), 9);
    assert.equal(next.getUTCMinutes(), 0);
    assert.equal(next.getUTCDate(), 2);
  });

  it("returns same day if before scheduled time for 0 14 * * *", () => {
    const now = new Date("2026-03-01T10:00:00Z");
    const next = getNextRun("0 14 * * *", now);
    assert.equal(next.getUTCHours(), 14);
    assert.equal(next.getUTCMinutes(), 0);
    assert.equal(next.getUTCDate(), 1);
  });

  it("handles */5 correctly", () => {
    const now = new Date("2026-03-01T10:03:00Z");
    const next = getNextRun("*/5 * * * *", now);
    assert.equal(next.getUTCMinutes(), 5);
    assert.equal(next.getUTCHours(), 10);
  });

  it("handles end of month", () => {
    const now = new Date("2026-03-31T23:59:00Z");
    const next = getNextRun("0 0 1 * *", now);
    // Should be April 1st
    assert.equal(next.getUTCMonth(), 3); // April (0-indexed)
    assert.equal(next.getUTCDate(), 1);
    assert.equal(next.getUTCHours(), 0);
    assert.equal(next.getUTCMinutes(), 0);
  });

  it("handles specific month", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const next = getNextRun("0 0 1 6 *", now);
    // Should be June 1st
    assert.equal(next.getUTCMonth(), 5); // June (0-indexed)
    assert.equal(next.getUTCDate(), 1);
  });

  it("handles weekday filter", () => {
    // 2026-03-02 is a Monday (dow=1)
    const now = new Date("2026-03-01T00:00:00Z"); // Sunday
    const next = getNextRun("0 9 * * 1", now);
    assert.equal(next.getUTCDay(), 1); // Monday
    assert.equal(next.getUTCHours(), 9);
  });

  it("handles comma-separated values", () => {
    const now = new Date("2026-03-01T10:20:00Z");
    const next = getNextRun("0,30 * * * *", now);
    assert.equal(next.getUTCMinutes(), 30);
    assert.equal(next.getUTCHours(), 10);
  });
});
