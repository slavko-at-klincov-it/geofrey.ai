import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { systemInfoOp, diskSpaceOp, envGetOp } from "./system-ops.js";

describe("system-ops", () => {
  describe("systemInfoOp", () => {
    it("returns system information", () => {
      const result = systemInfoOp();
      assert.ok(result.includes("Hostname:"));
      assert.ok(result.includes("Platform:"));
      assert.ok(result.includes("CPU:"));
      assert.ok(result.includes("Memory:"));
      assert.ok(result.includes("Uptime:"));
    });
  });

  describe("diskSpaceOp", () => {
    it("returns disk space info", async () => {
      const result = await diskSpaceOp();
      assert.ok(result.length > 0);
      // On Unix, df -h output contains "Filesystem"
      if (process.platform !== "win32") {
        assert.ok(result.includes("Filesystem"));
      }
    });
  });

  describe("envGetOp", () => {
    it("returns env variable value", () => {
      process.env.TEST_LOCAL_OPS = "test_value";
      const result = envGetOp("TEST_LOCAL_OPS");
      assert.equal(result, "TEST_LOCAL_OPS=test_value");
      delete process.env.TEST_LOCAL_OPS;
    });

    it("returns not-set message for missing var", () => {
      const result = envGetOp("NONEXISTENT_VAR_XYZ_123");
      assert.ok(result.includes("NONEXISTENT_VAR_XYZ_123"));
    });

    it("redacts sensitive values", () => {
      process.env.TEST_SECRET_KEY = "super-secret-12345";
      const result = envGetOp("TEST_SECRET_KEY");
      assert.ok(result.includes("***"));
      assert.ok(!result.includes("super-secret-12345"));
      delete process.env.TEST_SECRET_KEY;
    });
  });
});
