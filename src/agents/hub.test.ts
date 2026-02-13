import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHub, type HubRouter } from "./hub.js";
import { _resetAgents, registerAgent, getAgent, listAgents } from "./communication.js";
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

/** Simple mock executor that echoes back. */
async function echoExecutor(agentId: string, _chatId: string, message: string): Promise<string> {
  return `[${agentId}] ${message}`;
}

describe("hub", () => {
  let tempDir: string;

  beforeEach(async () => {
    _resetAgents();
    tempDir = await mkdtemp(join(tmpdir(), "hub-test-"));
  });

  after(async () => {
    _resetAgents();
    // Cleanup temp dirs
    try {
      await rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("init", () => {
    it("creates default hub agent on first startup", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const hubAgent = getAgent("hub");
      assert.ok(hubAgent);
      assert.equal(hubAgent.type, "hub");
      assert.equal(hubAgent.enabled, true);
    });

    it("persists hub agent to disk", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const files = await readdir(tempDir);
      assert.ok(files.includes("hub.json"));

      const content = await readFile(join(tempDir, "hub.json"), "utf-8");
      const parsed = JSON.parse(content);
      assert.equal(parsed.id, "hub");
      assert.equal(parsed.type, "hub");
    });

    it("does not overwrite existing hub agent", async () => {
      // Pre-create a hub with custom name
      const customHub = makeAgent({ id: "hub", type: "hub", name: "Custom Hub" });
      const { writeFile: wf } = await import("node:fs/promises");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(tempDir, { recursive: true });
      await wf(join(tempDir, "hub.json"), JSON.stringify(customHub), "utf-8");

      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const loaded = getAgent("hub");
      assert.ok(loaded);
      assert.equal(loaded.name, "Custom Hub");
    });

    it("loads existing agents from disk", async () => {
      const { writeFile: wf } = await import("node:fs/promises");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(tempDir, { recursive: true });
      await wf(
        join(tempDir, "coder.json"),
        JSON.stringify(makeAgent({ id: "coder", name: "Coder" })),
        "utf-8",
      );

      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const coder = getAgent("coder");
      assert.ok(coder);
      assert.equal(coder.name, "Coder");
    });

    it("sets isActive to true after init", async () => {
      const hub = createHub({ agentsDir: tempDir });
      assert.equal(hub.isActive(), false);

      await hub.init(echoExecutor);
      assert.equal(hub.isActive(), true);
    });
  });

  describe("route — explicit @mention", () => {
    it("routes to mentioned agent", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      registerAgent(makeAgent({ id: "coder", name: "Coder" }));

      const result = await hub.route("chat1", "@coder fix the bug");
      assert.equal(result.agentId, "coder");
      assert.equal(result.response, "[coder] fix the bug");
      assert.ok(result.routingReason.includes("explicit"));
    });

    it("strips @mention from message sent to agent", async () => {
      const hub = createHub({ agentsDir: tempDir });
      let receivedMessage = "";
      await hub.init(async (agentId, chatId, message) => {
        receivedMessage = message;
        return "ok";
      });

      registerAgent(makeAgent({ id: "researcher" }));
      await hub.route("chat1", "@researcher search for cats");
      assert.equal(receivedMessage, "search for cats");
    });

    it("falls through when mentioned agent does not exist", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const result = await hub.route("chat1", "@nonexistent do something");
      // Should fall through to hub handling
      assert.equal(result.agentId, "hub");
    });

    it("falls through when mentioned agent is disabled", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      registerAgent(makeAgent({ id: "disabled-agent", enabled: false }));
      const result = await hub.route("chat1", "@disabled-agent do something");
      assert.equal(result.agentId, "hub");
    });
  });

  describe("route — skill-based (default)", () => {
    it("routes coding tasks to coder agent", async () => {
      const hub = createHub({ agentsDir: tempDir, routingStrategy: "skill-based" });
      await hub.init(echoExecutor);

      registerAgent(makeAgent({
        id: "coder",
        name: "Coder",
        skills: ["coding", "debugging", "testing", "refactoring"],
      }));

      const result = await hub.route("chat1", "I need help debugging this function");
      assert.equal(result.agentId, "coder");
      assert.ok(result.routingReason.includes("skill-based"));
    });

    it("routes research tasks to researcher agent", async () => {
      const hub = createHub({ agentsDir: tempDir, routingStrategy: "skill-based" });
      await hub.init(echoExecutor);

      registerAgent(makeAgent({
        id: "researcher",
        name: "Researcher",
        skills: ["research", "search", "summarize"],
      }));

      const result = await hub.route("chat1", "Search for the latest news about AI");
      assert.equal(result.agentId, "researcher");
    });

    it("falls back to hub when no skill matches", async () => {
      const hub = createHub({ agentsDir: tempDir, routingStrategy: "skill-based" });
      await hub.init(echoExecutor);

      registerAgent(makeAgent({
        id: "coder",
        skills: ["coding"],
      }));

      const result = await hub.route("chat1", "Hello, how are you?");
      assert.equal(result.agentId, "hub");
      assert.ok(result.routingReason.includes("no specialist matched"));
    });

    it("picks agent with highest skill match score", async () => {
      const hub = createHub({ agentsDir: tempDir, routingStrategy: "skill-based" });
      await hub.init(echoExecutor);

      registerAgent(makeAgent({
        id: "coder",
        skills: ["coding"],
      }));
      registerAgent(makeAgent({
        id: "researcher",
        skills: ["research", "search", "summarize", "fact-check"],
      }));

      // This message mentions "research" and "summarize" — researcher has more matches
      const result = await hub.route("chat1", "research and summarize the topic");
      assert.equal(result.agentId, "researcher");
    });
  });

  describe("route — intent-based", () => {
    it("routes based on coding intent signals", async () => {
      const hub = createHub({ agentsDir: tempDir, routingStrategy: "intent-based" });
      await hub.init(echoExecutor);

      registerAgent(makeAgent({ id: "coder" }));

      const result = await hub.route("chat1", "there is a bug in the import");
      assert.equal(result.agentId, "coder");
      assert.ok(result.routingReason.includes("intent-based"));
    });

    it("routes based on scheduling intent signals", async () => {
      const hub = createHub({ agentsDir: tempDir, routingStrategy: "intent-based" });
      await hub.init(echoExecutor);

      registerAgent(makeAgent({ id: "scheduler" }));

      const result = await hub.route("chat1", "remind me tomorrow about the meeting");
      assert.equal(result.agentId, "scheduler");
    });

    it("falls back to hub for no intent match", async () => {
      const hub = createHub({ agentsDir: tempDir, routingStrategy: "intent-based" });
      await hub.init(echoExecutor);

      registerAgent(makeAgent({ id: "coder" }));

      const result = await hub.route("chat1", "hi there");
      assert.equal(result.agentId, "hub");
    });
  });

  describe("route — explicit strategy", () => {
    it("only routes on @mention, never automatic", async () => {
      const hub = createHub({ agentsDir: tempDir, routingStrategy: "explicit" });
      await hub.init(echoExecutor);

      registerAgent(makeAgent({
        id: "coder",
        skills: ["coding", "debugging"],
      }));

      // Even though this clearly matches coding, explicit strategy won't auto-route
      const result = await hub.route("chat1", "fix the coding bug and debug it");
      assert.equal(result.agentId, "hub");

      // But @mention still works
      const result2 = await hub.route("chat1", "@coder fix the bug");
      assert.equal(result2.agentId, "coder");
    });
  });

  describe("saveAgent", () => {
    it("persists agent to disk and registers in memory", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const agent = makeAgent({ id: "saved-agent", name: "Saved" });
      await hub.saveAgent(agent);

      // In memory
      const found = getAgent("saved-agent");
      assert.ok(found);
      assert.equal(found.name, "Saved");

      // On disk
      const content = await readFile(join(tempDir, "saved-agent.json"), "utf-8");
      const parsed = JSON.parse(content);
      assert.equal(parsed.id, "saved-agent");
    });
  });

  describe("deleteAgent", () => {
    it("deletes agent from disk and registry", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const agent = makeAgent({ id: "delete-me" });
      await hub.saveAgent(agent);

      const deleted = await hub.deleteAgent("delete-me");
      assert.equal(deleted, true);

      // Verify removed from memory
      assert.equal(getAgent("delete-me"), undefined);

      // Verify removed from disk
      const files = await readdir(tempDir);
      assert.ok(!files.includes("delete-me.json"));
    });

    it("cannot delete hub agent", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const deleted = await hub.deleteAgent("hub");
      assert.equal(deleted, false);

      // Hub should still exist
      assert.ok(getAgent("hub"));
    });

    it("returns false for non-existent agent", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const deleted = await hub.deleteAgent("nonexistent");
      assert.equal(deleted, false);
    });
  });

  describe("createAgentFromTemplate", () => {
    it("creates agent from template and saves to disk", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const agent = await hub.createAgentFromTemplate("coder");
      assert.ok(agent);
      assert.equal(agent.id, "coder");
      assert.equal(agent.type, "specialist");

      // Verify in memory
      assert.ok(getAgent("coder"));

      // Verify on disk
      const files = await readdir(tempDir);
      assert.ok(files.includes("coder.json"));
    });

    it("creates agent with custom id", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const agent = await hub.createAgentFromTemplate("researcher", "my-researcher");
      assert.ok(agent);
      assert.equal(agent.id, "my-researcher");
    });

    it("returns undefined for unknown template", async () => {
      const hub = createHub({ agentsDir: tempDir });
      await hub.init(echoExecutor);

      const agent = await hub.createAgentFromTemplate("unknown-template");
      assert.equal(agent, undefined);
    });
  });

  describe("getRoutingStrategy", () => {
    it("returns default skill-based strategy", () => {
      const hub = createHub({ agentsDir: tempDir });
      assert.equal(hub.getRoutingStrategy(), "skill-based");
    });

    it("returns configured strategy", () => {
      const hub = createHub({ agentsDir: tempDir, routingStrategy: "intent-based" });
      assert.equal(hub.getRoutingStrategy(), "intent-based");
    });
  });
});
