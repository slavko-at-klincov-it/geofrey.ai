import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isProactiveTask,
  parseJobType,
  JOB_TAG_PREFIX,
} from "./handler.js";

describe("proactive/handler", () => {
  describe("JOB_TAG_PREFIX", () => {
    it("is a non-empty string starting with __", () => {
      assert.equal(typeof JOB_TAG_PREFIX, "string");
      assert.ok(JOB_TAG_PREFIX.startsWith("__"));
    });
  });

  describe("isProactiveTask", () => {
    it("returns true for tasks with prefix", () => {
      assert.equal(isProactiveTask(`${JOB_TAG_PREFIX}morning_brief`), true);
      assert.equal(isProactiveTask(`${JOB_TAG_PREFIX}calendar_watch`), true);
      assert.equal(isProactiveTask(`${JOB_TAG_PREFIX}email_monitor`), true);
    });

    it("returns false for tasks without prefix", () => {
      assert.equal(isProactiveTask("morning_brief"), false);
      assert.equal(isProactiveTask("say hello"), false);
      assert.equal(isProactiveTask(""), false);
    });

    it("returns true for unknown proactive tasks with prefix", () => {
      assert.equal(isProactiveTask(`${JOB_TAG_PREFIX}unknown_type`), true);
    });
  });

  describe("parseJobType", () => {
    it("extracts morning_brief", () => {
      assert.equal(parseJobType(`${JOB_TAG_PREFIX}morning_brief`), "morning_brief");
    });

    it("extracts calendar_watch", () => {
      assert.equal(parseJobType(`${JOB_TAG_PREFIX}calendar_watch`), "calendar_watch");
    });

    it("extracts email_monitor", () => {
      assert.equal(parseJobType(`${JOB_TAG_PREFIX}email_monitor`), "email_monitor");
    });

    it("returns null for unknown proactive type", () => {
      assert.equal(parseJobType(`${JOB_TAG_PREFIX}unknown_type`), null);
    });

    it("returns null for non-proactive tasks", () => {
      assert.equal(parseJobType("say hello"), null);
      assert.equal(parseJobType("morning_brief"), null);
    });

    it("returns null for empty string", () => {
      assert.equal(parseJobType(""), null);
    });
  });
});
