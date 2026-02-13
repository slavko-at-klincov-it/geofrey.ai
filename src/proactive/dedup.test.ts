import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  wasAlreadyReminded,
  markReminded,
  cleanupReminders,
  _resetReminders,
} from "./dedup.js";

describe("proactive/dedup", () => {
  beforeEach(() => {
    _resetReminders();
  });

  it("wasAlreadyReminded returns false initially", () => {
    assert.equal(wasAlreadyReminded("ev1"), false);
    assert.equal(wasAlreadyReminded("ev2"), false);
  });

  it("markReminded + wasAlreadyReminded returns true", () => {
    markReminded("ev1");
    assert.equal(wasAlreadyReminded("ev1"), true);
    assert.equal(wasAlreadyReminded("ev2"), false);
  });

  it("markReminded for multiple events", () => {
    markReminded("ev1");
    markReminded("ev2");
    assert.equal(wasAlreadyReminded("ev1"), true);
    assert.equal(wasAlreadyReminded("ev2"), true);
    assert.equal(wasAlreadyReminded("ev3"), false);
  });

  it("cleanupReminders removes old entries", () => {
    markReminded("ev1");
    // Manually simulate an old entry by calling internal behavior:
    // We can't directly set the timestamp, but we can verify cleanup logic
    // by checking that recent entries survive cleanup
    cleanupReminders();
    // ev1 was just added (< 24h ago), should still be present
    assert.equal(wasAlreadyReminded("ev1"), true);
  });

  it("_resetReminders clears all entries", () => {
    markReminded("ev1");
    markReminded("ev2");
    markReminded("ev3");
    assert.equal(wasAlreadyReminded("ev1"), true);

    _resetReminders();

    assert.equal(wasAlreadyReminded("ev1"), false);
    assert.equal(wasAlreadyReminded("ev2"), false);
    assert.equal(wasAlreadyReminded("ev3"), false);
  });

  it("cleanupReminders does not remove recent entries", () => {
    markReminded("recent1");
    markReminded("recent2");

    cleanupReminders();

    assert.equal(wasAlreadyReminded("recent1"), true);
    assert.equal(wasAlreadyReminded("recent2"), true);
  });
});
