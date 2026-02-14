import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHub, type HubRouter } from "../../agents/hub.js";
import {
  registerAgent,
  getAgent,
  _resetAgents,
  sendToAgent,
  setAgentExecutor,
  type AgentExecutor,
} from "../../agents/communication.js";
import { agentChatId } from "../../agents/session-manager.js";
import type { AgentConfig } from "../../agents/agent-config.js";
import { createTestEnv, type TestEnv } from "./helpers/test-env.js";

function makeAgent(overrides: Partial<AgentConfig> & { id: string }): AgentConfig {
  return {
    name: overrides.name ?? overrides.id,
    type: "specialist",
    description: "",
    systemPrompt: "Du bist ein Test-Agent.",
    modelId: "local",
    allowedTools: [],
    memoryScope: "shared",
    skills: [],
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("E2E: Multi-Agent Routing", { timeout: 30_000 }, () => {
  let env: TestEnv;

  before(async () => {
    env = await createTestEnv();
  });

  after(async () => {
    _resetAgents();
    await env.cleanup();
  });

  it("createHub creates hub with routing strategy", () => {
    const hub = createHub({ routingStrategy: "skill-based", agentsDir: env.tmpDir });

    assert.ok(hub, "createHub should return an object");
    assert.equal(typeof hub.route, "function", "hub should have a route method");
    assert.equal(typeof hub.init, "function", "hub should have an init method");
    assert.equal(typeof hub.saveAgent, "function", "hub should have a saveAgent method");
    assert.equal(hub.getRoutingStrategy(), "skill-based");
    assert.equal(hub.isActive(), false, "hub should not be active before init");
  });

  it("registerAgent + getAgent round-trip", () => {
    _resetAgents();

    const config = makeAgent({
      id: "code-agent",
      name: "Code Agent",
      description: "Bearbeitet Code-Aufgaben",
      skills: ["coding", "debugging"],
      allowedTools: ["claude_code", "read_file"],
    });

    registerAgent(config);
    const retrieved = getAgent("code-agent");

    assert.ok(retrieved, "getAgent should return the registered agent");
    assert.equal(retrieved.id, "code-agent");
    assert.equal(retrieved.name, "Code Agent");
    assert.equal(retrieved.description, "Bearbeitet Code-Aufgaben");
    assert.deepEqual(retrieved.skills, ["coding", "debugging"]);
    assert.deepEqual(retrieved.allowedTools, ["claude_code", "read_file"]);
    assert.equal(retrieved.enabled, true);
    assert.equal(retrieved.type, "specialist");
    assert.equal(retrieved.memoryScope, "shared");
  });

  it("agentChatId creates namespaced chat IDs", () => {
    const result = agentChatId("code-agent", "user-123");

    assert.ok(result.includes("code-agent"), "Namespaced ID should include agent ID");
    assert.ok(result.includes("user-123"), "Namespaced ID should include chat ID");
    assert.equal(result, "agent:code-agent:user-123");

    // Different agents produce different namespaced IDs
    const other = agentChatId("research-agent", "user-123");
    assert.notEqual(result, other, "Different agents should have different namespaced IDs");
  });

  it("sendMessage delivers to target agent", async () => {
    _resetAgents();

    const agentA = makeAgent({ id: "agent-a", name: "Agent A", skills: ["sending"] });
    const agentB = makeAgent({ id: "agent-b", name: "Agent B", skills: ["receiving"] });
    registerAgent(agentA);
    registerAgent(agentB);

    // Set up executor that echoes back the message
    const executorFn: AgentExecutor = async (_agentId, _chatId, message) => {
      return `Antwort auf: ${message}`;
    };
    setAgentExecutor(executorFn);

    const result = await sendToAgent("agent-b", "user-456", "Hallo von Agent A");

    assert.equal(result.agentId, "agent-b");
    assert.ok(
      result.response.includes("Hallo von Agent A"),
      `Response should include the original message, got: ${result.response}`,
    );
    assert.ok(result.messageCount > 0, "Message count should be > 0 after sending");
  });

  it("hub routes message to executor", async () => {
    _resetAgents();

    const agentsDir = `${env.tmpDir}/agents-hub-test`;
    const hub = createHub({ routingStrategy: "skill-based", agentsDir });

    let executedAgentId = "";
    let executedMessage = "";
    const mockExecutor: AgentExecutor = async (agentId, _chatId, message) => {
      executedAgentId = agentId;
      executedMessage = message;
      return "Aufgabe erledigt.";
    };

    await hub.init(mockExecutor);
    assert.equal(hub.isActive(), true, "hub should be active after init");

    // Save a specialist that matches "coding" and "debugging" skills
    const coder = makeAgent({
      id: "coder",
      name: "Coder",
      skills: ["coding", "debugging", "refactoring"],
    });
    await hub.saveAgent(coder);

    // Route a message containing "coding" (exact skill keyword match)
    const result = await hub.route("user-789", "Ich brauche Hilfe beim coding in utils.ts");

    assert.equal(result.agentId, "coder", "Message should be routed to the coder agent");
    assert.ok(
      result.routingReason.includes("skill-based"),
      `Routing reason should mention skill-based, got: ${result.routingReason}`,
    );
    assert.equal(result.response, "Aufgabe erledigt.");
    assert.equal(executedAgentId, "coder");
    assert.ok(
      executedMessage.includes("coding"),
      "Executor should receive the original user message",
    );
  });
});
