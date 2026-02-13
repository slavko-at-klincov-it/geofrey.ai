import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  spawnProcess,
  listProcesses,
  checkProcess,
  killProcess,
  getProcessLogs,
  killAllProcesses,
  _testClearAll,
} from "./manager.js";

describe("process manager", () => {
  beforeEach(async () => {
    await killAllProcesses();
    _testClearAll();
  });

  after(async () => {
    await killAllProcesses();
    _testClearAll();
  });

  describe("spawnProcess", () => {
    it("creates entry and returns ProcessInfo with pid", () => {
      const info = spawnProcess({ name: "echo-test", command: "echo hello" });
      assert.equal(typeof info.pid, "number");
      assert.ok(info.pid > 0);
      assert.equal(info.name, "echo-test");
      assert.equal(info.command, "echo hello");
      assert.equal(info.status, "running");
      assert.ok(info.startedAt instanceof Date);
    });

    it("records exit status after command completes", async () => {
      spawnProcess({ name: "quick-echo", command: "echo done" });
      // Wait for process to finish
      await new Promise((r) => setTimeout(r, 500));
      const list = listProcesses();
      const entry = list.find((p) => p.name === "quick-echo");
      assert.ok(entry);
      assert.equal(entry.status, "stopped");
      assert.equal(entry.exitCode, 0);
    });

    it("records errored status for failing commands", async () => {
      spawnProcess({ name: "fail-cmd", command: "exit 42" });
      await new Promise((r) => setTimeout(r, 500));
      const list = listProcesses();
      const entry = list.find((p) => p.name === "fail-cmd");
      assert.ok(entry);
      assert.equal(entry.status, "errored");
      assert.equal(entry.exitCode, 42);
    });
  });

  describe("listProcesses", () => {
    it("returns empty array when no processes", () => {
      const list = listProcesses();
      assert.equal(list.length, 0);
    });

    it("returns all tracked processes", () => {
      spawnProcess({ name: "p1", command: "sleep 10" });
      spawnProcess({ name: "p2", command: "sleep 10" });
      const list = listProcesses();
      assert.equal(list.length, 2);
      const names = list.map((p) => p.name).sort();
      assert.deepEqual(names, ["p1", "p2"]);
    });
  });

  describe("checkProcess", () => {
    it("returns info for existing process", () => {
      const spawned = spawnProcess({ name: "check-me", command: "sleep 10" });
      const info = checkProcess(spawned.pid);
      assert.ok(info);
      assert.equal(info.pid, spawned.pid);
      assert.equal(info.name, "check-me");
    });

    it("returns undefined for unknown PID", () => {
      const info = checkProcess(999999);
      assert.equal(info, undefined);
    });

    it("detects dead process via signal 0", async () => {
      const spawned = spawnProcess({ name: "short-lived", command: "echo fast" });
      await new Promise((r) => setTimeout(r, 500));
      const info = checkProcess(spawned.pid);
      assert.ok(info);
      assert.notEqual(info.status, "running");
    });
  });

  describe("killProcess", () => {
    it("kills a running process with SIGTERM", async () => {
      const spawned = spawnProcess({ name: "sleeper", command: "sleep 60" });
      // Brief pause to ensure process is started
      await new Promise((r) => setTimeout(r, 200));

      const result = await killProcess(spawned.pid);
      assert.equal(result.killed, true);

      const info = checkProcess(spawned.pid);
      assert.ok(info);
      assert.notEqual(info.status, "running");
    });

    it("returns killed=false for unknown PID", async () => {
      const result = await killProcess(999999);
      assert.equal(result.killed, false);
      assert.equal(result.forced, false);
    });

    it("returns killed=true for already stopped process", async () => {
      const spawned = spawnProcess({ name: "done", command: "echo done" });
      await new Promise((r) => setTimeout(r, 500));

      const result = await killProcess(spawned.pid);
      assert.equal(result.killed, true);
      assert.equal(result.forced, false);
    });
  });

  describe("getProcessLogs (ring buffer)", () => {
    it("captures stdout lines", async () => {
      const spawned = spawnProcess({
        name: "logger",
        command: "echo line1 && echo line2 && echo line3",
      });
      // Wait for output
      await new Promise((r) => setTimeout(r, 500));

      const logs = getProcessLogs(spawned.pid);
      assert.ok(logs.length >= 3);
      assert.ok(logs.includes("line1"));
      assert.ok(logs.includes("line2"));
      assert.ok(logs.includes("line3"));
    });

    it("returns empty array for unknown PID", () => {
      const logs = getProcessLogs(999999);
      assert.deepEqual(logs, []);
    });

    it("respects line count parameter", async () => {
      const spawned = spawnProcess({
        name: "multi-line",
        command: "echo a && echo b && echo c && echo d && echo e",
      });
      await new Promise((r) => setTimeout(r, 500));

      const logs = getProcessLogs(spawned.pid, 2);
      assert.equal(logs.length, 2);
      // Should be the last 2 lines
      assert.ok(logs.includes("d"));
      assert.ok(logs.includes("e"));
    });

    it("defaults to 50 lines", async () => {
      const spawned = spawnProcess({ name: "few", command: "echo one && echo two" });
      await new Promise((r) => setTimeout(r, 500));

      // Asking for default (50) but only 2 lines exist
      const logs = getProcessLogs(spawned.pid);
      assert.ok(logs.length <= 50);
      assert.ok(logs.length >= 2);
    });

    it("clamps lines to max 1000", async () => {
      const spawned = spawnProcess({ name: "clamp", command: "echo x" });
      await new Promise((r) => setTimeout(r, 500));

      // Request more than max — should not error
      const logs = getProcessLogs(spawned.pid, 5000);
      assert.ok(logs.length >= 1);
    });
  });

  describe("killAllProcesses", () => {
    it("stops all running processes", async () => {
      spawnProcess({ name: "s1", command: "sleep 60" });
      spawnProcess({ name: "s2", command: "sleep 60" });
      await new Promise((r) => setTimeout(r, 200));

      await killAllProcesses();

      const list = listProcesses();
      for (const p of list) {
        assert.notEqual(p.status, "running");
      }
    });

    it("handles no running processes gracefully", async () => {
      // Should not throw
      await killAllProcesses();
    });
  });
});
