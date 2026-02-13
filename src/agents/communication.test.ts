import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadAgents,
  registerAgent,
  unregisterAgent,
  getAgent,
  listAgents,
  listEnabledAgents,
  getHubAgent,
  getSpecialistAgents,
  setAgentExecutor,
  sendToAgent,
  readAgentHistory,
  formatAgentList,
  _resetAgents,
} from "./communication.js";
import type { AgentConfig } from "./agent-config.js";

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "test-agent",
    name: "Test Agent",
    type: "specialist",
    description: "A test agent",
    systemPrompt: "You are a test agent.",
    modelId: "local",
    allowedTools: ["read_file"],
    memoryScope: "shared",
    skills: ["testing"],
    enabled: true,
    createdAt: "2026-02-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("communication", () => {
  beforeEach(() => {
    _resetAgents();
  });

  describe("registerAgent / getAgent / unregisterAgent", () => {
    it("registers and retrieves an agent", () => {
      const agent = makeAgent({ id: "reg-test" });
      registerAgent(agent);

      const found = getAgent("reg-test");
      assert.ok(found);
      assert.equal(found.id, "reg-test");
      assert.equal(found.name, "Test Agent");
    });

    it("returns undefined for unknown agent", () => {
      const found = getAgent("nonexistent");
      assert.equal(found, undefined);
    });

    it("overwrites existing agent with same id", () => {
      registerAgent(makeAgent({ id: "overwrite", name: "First" }));
      registerAgent(makeAgent({ id: "overwrite", name: "Second" }));

      const found = getAgent("overwrite");
      assert.ok(found);
      assert.equal(found.name, "Second");
    });

    it("unregisters an agent", () => {
      registerAgent(makeAgent({ id: "unreg-test" }));
      const removed = unregisterAgent("unreg-test");
      assert.equal(removed, true);

      const found = getAgent("unreg-test");
      assert.equal(found, undefined);
    });

    it("returns false when unregistering unknown agent", () => {
      const removed = unregisterAgent("nonexistent");
      assert.equal(removed, false);
    });
  });

  describe("listAgents / listEnabledAgents", () => {
    it("returns empty array when no agents", () => {
      assert.deepEqual(listAgents(), []);
    });

    it("returns all registered agents", () => {
      registerAgent(makeAgent({ id: "a" }));
      registerAgent(makeAgent({ id: "b" }));

      const all = listAgents();
      assert.equal(all.length, 2);
      const ids = all.map((a) => a.id).sort();
      assert.deepEqual(ids, ["a", "b"]);
    });

    it("listEnabledAgents filters disabled agents", () => {
      registerAgent(makeAgent({ id: "enabled-1", enabled: true }));
      registerAgent(makeAgent({ id: "disabled-1", enabled: false }));
      registerAgent(makeAgent({ id: "enabled-2", enabled: true }));

      const enabled = listEnabledAgents();
      assert.equal(enabled.length, 2);
      const ids = enabled.map((a) => a.id).sort();
      assert.deepEqual(ids, ["enabled-1", "enabled-2"]);
    });
  });

  describe("getHubAgent / getSpecialistAgents", () => {
    it("returns hub agent", () => {
      registerAgent(makeAgent({ id: "hub", type: "hub" }));
      registerAgent(makeAgent({ id: "coder", type: "specialist" }));

      const hub = getHubAgent();
      assert.ok(hub);
      assert.equal(hub.id, "hub");
      assert.equal(hub.type, "hub");
    });

    it("returns undefined when no hub exists", () => {
      registerAgent(makeAgent({ id: "coder", type: "specialist" }));
      const hub = getHubAgent();
      assert.equal(hub, undefined);
    });

    it("returns only enabled hub", () => {
      registerAgent(makeAgent({ id: "hub", type: "hub", enabled: false }));
      const hub = getHubAgent();
      assert.equal(hub, undefined);
    });

    it("returns specialist agents only", () => {
      registerAgent(makeAgent({ id: "hub", type: "hub" }));
      registerAgent(makeAgent({ id: "coder", type: "specialist" }));
      registerAgent(makeAgent({ id: "researcher", type: "specialist" }));

      const specialists = getSpecialistAgents();
      assert.equal(specialists.length, 2);
      const ids = specialists.map((a) => a.id).sort();
      assert.deepEqual(ids, ["coder", "researcher"]);
    });
  });

  describe("loadAgents", () => {
    it("loads agents from a directory", async () => {
      const dir = await mkdtemp(join(tmpdir(), "agents-"));
      try {
        const agent = makeAgent({ id: "loaded-agent" });
        await writeFile(join(dir, "loaded-agent.json"), JSON.stringify(agent), "utf-8");

        const loaded = await loadAgents(dir);
        assert.equal(loaded.length, 1);
        assert.equal(loaded[0].id, "loaded-agent");

        // Also registered in memory
        const found = getAgent("loaded-agent");
        assert.ok(found);
      } finally {
        await rm(dir, { recursive: true });
      }
    });

    it("skips invalid JSON files", async () => {
      const dir = await mkdtemp(join(tmpdir(), "agents-"));
      try {
        await writeFile(join(dir, "bad.json"), "not json", "utf-8");
        await writeFile(
          join(dir, "good.json"),
          JSON.stringify(makeAgent({ id: "good" })),
          "utf-8",
        );

        const loaded = await loadAgents(dir);
        assert.equal(loaded.length, 1);
        assert.equal(loaded[0].id, "good");
      } finally {
        await rm(dir, { recursive: true });
      }
    });

    it("skips files that fail schema validation", async () => {
      const dir = await mkdtemp(join(tmpdir(), "agents-"));
      try {
        await writeFile(
          join(dir, "invalid.json"),
          JSON.stringify({ id: "invalid" }), // Missing required fields
          "utf-8",
        );

        const loaded = await loadAgents(dir);
        assert.equal(loaded.length, 0);
      } finally {
        await rm(dir, { recursive: true });
      }
    });

    it("returns empty array for non-existent directory", async () => {
      const loaded = await loadAgents("/tmp/nonexistent-agents-dir-12345");
      assert.deepEqual(loaded, []);
    });

    it("ignores non-JSON files", async () => {
      const dir = await mkdtemp(join(tmpdir(), "agents-"));
      try {
        await writeFile(join(dir, "readme.md"), "# Agents", "utf-8");
        await writeFile(
          join(dir, "valid.json"),
          JSON.stringify(makeAgent({ id: "valid" })),
          "utf-8",
        );

        const loaded = await loadAgents(dir);
        assert.equal(loaded.length, 1);
      } finally {
        await rm(dir, { recursive: true });
      }
    });

    it("clears previous agents on reload", async () => {
      registerAgent(makeAgent({ id: "old" }));
      assert.ok(getAgent("old"));

      const dir = await mkdtemp(join(tmpdir(), "agents-"));
      try {
        await writeFile(
          join(dir, "new.json"),
          JSON.stringify(makeAgent({ id: "new" })),
          "utf-8",
        );

        await loadAgents(dir);

        // Old agent should be gone
        assert.equal(getAgent("old"), undefined);
        // New agent should be present
        assert.ok(getAgent("new"));
      } finally {
        await rm(dir, { recursive: true });
      }
    });
  });

  describe("sendToAgent", () => {
    it("returns error for unknown agent", async () => {
      const result = await sendToAgent("nonexistent", "chat1", "hello");
      assert.ok(result.response.includes("not found"));
      assert.equal(result.messageCount, 0);
    });

    it("returns error for disabled agent", async () => {
      registerAgent(makeAgent({ id: "disabled", enabled: false }));
      const result = await sendToAgent("disabled", "chat1", "hello");
      assert.ok(result.response.includes("disabled"));
      assert.equal(result.messageCount, 0);
    });

    it("returns error when executor not set", async () => {
      registerAgent(makeAgent({ id: "no-exec" }));
      const result = await sendToAgent("no-exec", "chat1", "hello");
      assert.ok(result.response.includes("not configured"));
    });

    it("sends message to agent via executor and returns response", async () => {
      registerAgent(makeAgent({ id: "exec-test" }));
      setAgentExecutor(async (_agentId, _chatId, message) => {
        return `Echo: ${message}`;
      });

      const result = await sendToAgent("exec-test", "chat1", "Hello agent");
      assert.equal(result.agentId, "exec-test");
      assert.equal(result.response, "Echo: Hello agent");
      assert.ok(result.messageCount > 0);
    });

    it("records messages in agent session", async () => {
      registerAgent(makeAgent({ id: "session-test" }));
      setAgentExecutor(async () => "Response");

      const chatId = `session-${Date.now()}`;
      await sendToAgent("session-test", chatId, "Test message");

      const { getAgentHistory } = await import("./session-manager.js");
      const history = getAgentHistory("session-test", chatId);
      assert.equal(history.length, 2); // user + assistant
      assert.equal(history[0].role, "user");
      assert.equal(history[0].content, "Test message");
      assert.equal(history[1].role, "assistant");
      assert.equal(history[1].content, "Response");
    });

    it("handles executor errors gracefully", async () => {
      registerAgent(makeAgent({ id: "error-test" }));
      setAgentExecutor(async () => {
        throw new Error("Agent crashed");
      });

      const result = await sendToAgent("error-test", "chat1", "hello");
      assert.ok(result.response.includes("Error from agent"));
      assert.ok(result.response.includes("Agent crashed"));
    });
  });

  describe("readAgentHistory", () => {
    it("returns error for unknown agent", () => {
      const result = readAgentHistory("unknown", "chat1");
      assert.ok(result.includes("not found"));
    });

    it("returns formatted history for existing agent", async () => {
      registerAgent(makeAgent({ id: "history-test" }));

      const { addAgentMessage } = await import("./session-manager.js");
      const chatId = `history-${Date.now()}`;
      addAgentMessage("history-test", chatId, { role: "user", content: "Question" });
      addAgentMessage("history-test", chatId, { role: "assistant", content: "Answer" });

      const result = readAgentHistory("history-test", chatId);
      assert.ok(result.includes("history-test"));
      assert.ok(result.includes("USER: Question"));
      assert.ok(result.includes("ASSISTANT: Answer"));
    });
  });

  describe("formatAgentList", () => {
    it("returns no-agents message when empty", () => {
      const result = formatAgentList();
      assert.equal(result, "No agents registered");
    });

    it("formats agent list with all details", () => {
      registerAgent(makeAgent({
        id: "coder",
        name: "Coder",
        type: "specialist",
        modelId: "gpt-4o",
        memoryScope: "isolated",
        skills: ["coding", "debugging"],
        allowedTools: ["claude_code", "read_file"],
      }));
      registerAgent(makeAgent({
        id: "hub",
        name: "Hub",
        type: "hub",
        skills: [],
        allowedTools: [],
      }));

      const result = formatAgentList();
      assert.ok(result.includes("2 agents:"));
      assert.ok(result.includes("[coder]"));
      assert.ok(result.includes("[hub]"));
      assert.ok(result.includes("type=specialist"));
      assert.ok(result.includes("type=hub"));
      assert.ok(result.includes("model=gpt-4o"));
      assert.ok(result.includes("memory=isolated"));
      assert.ok(result.includes("skills=[coding, debugging]"));
      assert.ok(result.includes("tools=2"));
      assert.ok(result.includes("enabled"));
    });

    it("shows disabled status", () => {
      registerAgent(makeAgent({ id: "off", enabled: false }));

      const result = formatAgentList();
      assert.ok(result.includes("disabled"));
    });
  });

  describe("_resetAgents", () => {
    it("clears all agents and executor", () => {
      registerAgent(makeAgent({ id: "reset-test" }));
      setAgentExecutor(async () => "test");
      assert.equal(listAgents().length, 1);

      _resetAgents();
      assert.equal(listAgents().length, 0);
    });
  });
});
