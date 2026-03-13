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
    assert.equal(wasAlreadyReminded("calendar", "ev1"), false);
    assert.equal(wasAlreadyReminded("email", "thread1"), false);
  });

  it("markReminded + wasAlreadyReminded returns true", () => {
    markReminded("calendar", "ev1");
    assert.equal(wasAlreadyReminded("calendar", "ev1"), true);
    assert.equal(wasAlreadyReminded("calendar", "ev2"), false);
  });

  it("markReminded for multiple events", () => {
    markReminded("calendar", "ev1");
    markReminded("calendar", "ev2");
    assert.equal(wasAlreadyReminded("calendar", "ev1"), true);
    assert.equal(wasAlreadyReminded("calendar", "ev2"), true);
    assert.equal(wasAlreadyReminded("calendar", "ev3"), false);
  });

  it("types are isolated", () => {
    markReminded("calendar", "id1");
    assert.equal(wasAlreadyReminded("calendar", "id1"), true);
    assert.equal(wasAlreadyReminded("email", "id1"), false);
  });

  it("cleanupReminders removes old entries", () => {
    markReminded("calendar", "ev1");
    cleanupReminders();
    // ev1 was just added (< 24h ago), should still be present
    assert.equal(wasAlreadyReminded("calendar", "ev1"), true);
  });

  it("_resetReminders clears all entries", () => {
    markReminded("calendar", "ev1");
    markReminded("email", "thread1");
    markReminded("calendar", "ev3");
    assert.equal(wasAlreadyReminded("calendar", "ev1"), true);

    _resetReminders();

    assert.equal(wasAlreadyReminded("calendar", "ev1"), false);
    assert.equal(wasAlreadyReminded("email", "thread1"), false);
    assert.equal(wasAlreadyReminded("calendar", "ev3"), false);
  });

  it("cleanupReminders does not remove recent entries", () => {
    markReminded("calendar", "recent1");
    markReminded("email", "recent2");

    cleanupReminders();

    assert.equal(wasAlreadyReminded("calendar", "recent1"), true);
    assert.equal(wasAlreadyReminded("email", "recent2"), true);
  });
});
