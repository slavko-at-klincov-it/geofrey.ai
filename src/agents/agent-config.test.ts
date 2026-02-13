import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  agentConfigSchema,
  parseAgentConfig,
  createFromTemplate,
  listTemplates,
  DEFAULT_HUB_CONFIG,
  SPECIALIST_TEMPLATES,
  AGENTS_DIR,
} from "./agent-config.js";

describe("agent-config", () => {
  describe("agentConfigSchema", () => {
    it("parses a valid minimal agent config", () => {
      const raw = {
        id: "test-agent",
        name: "Test Agent",
        type: "specialist",
        systemPrompt: "You are a test agent.",
      };

      const result = agentConfigSchema.parse(raw);
      assert.equal(result.id, "test-agent");
      assert.equal(result.name, "Test Agent");
      assert.equal(result.type, "specialist");
      assert.equal(result.systemPrompt, "You are a test agent.");
      assert.equal(result.modelId, "local");
      assert.deepEqual(result.allowedTools, []);
      assert.equal(result.memoryScope, "shared");
      assert.deepEqual(result.skills, []);
      assert.equal(result.enabled, true);
    });

    it("parses a full agent config with all fields", () => {
      const raw = {
        id: "coder",
        name: "Coder",
        type: "specialist",
        description: "Handles coding tasks",
        systemPrompt: "You are the Coder.",
        modelId: "gpt-4o",
        allowedTools: ["claude_code", "read_file"],
        memoryScope: "isolated",
        skills: ["coding", "debugging"],
        enabled: false,
        createdAt: "2026-02-13T00:00:00.000Z",
      };

      const result = agentConfigSchema.parse(raw);
      assert.equal(result.id, "coder");
      assert.equal(result.modelId, "gpt-4o");
      assert.deepEqual(result.allowedTools, ["claude_code", "read_file"]);
      assert.equal(result.memoryScope, "isolated");
      assert.deepEqual(result.skills, ["coding", "debugging"]);
      assert.equal(result.enabled, false);
      assert.equal(result.createdAt, "2026-02-13T00:00:00.000Z");
    });

    it("rejects empty id", () => {
      const raw = { id: "", name: "Test", type: "specialist", systemPrompt: "Test" };
      assert.throws(() => agentConfigSchema.parse(raw));
    });

    it("rejects id with uppercase letters", () => {
      const raw = { id: "TestAgent", name: "Test", type: "specialist", systemPrompt: "Test" };
      assert.throws(() => agentConfigSchema.parse(raw));
    });

    it("rejects id with spaces", () => {
      const raw = { id: "test agent", name: "Test", type: "specialist", systemPrompt: "Test" };
      assert.throws(() => agentConfigSchema.parse(raw));
    });

    it("allows id with dashes and numbers", () => {
      const raw = { id: "my-agent-42", name: "Test", type: "specialist", systemPrompt: "Test" };
      const result = agentConfigSchema.parse(raw);
      assert.equal(result.id, "my-agent-42");
    });

    it("rejects invalid type", () => {
      const raw = { id: "test", name: "Test", type: "worker", systemPrompt: "Test" };
      assert.throws(() => agentConfigSchema.parse(raw));
    });

    it("rejects missing systemPrompt", () => {
      const raw = { id: "test", name: "Test", type: "specialist" };
      assert.throws(() => agentConfigSchema.parse(raw));
    });

    it("rejects empty systemPrompt", () => {
      const raw = { id: "test", name: "Test", type: "specialist", systemPrompt: "" };
      assert.throws(() => agentConfigSchema.parse(raw));
    });

    it("rejects invalid memoryScope", () => {
      const raw = {
        id: "test", name: "Test", type: "specialist",
        systemPrompt: "Test", memoryScope: "global",
      };
      assert.throws(() => agentConfigSchema.parse(raw));
    });

    it("rejects invalid createdAt format", () => {
      const raw = {
        id: "test", name: "Test", type: "specialist",
        systemPrompt: "Test", createdAt: "not-a-date",
      };
      assert.throws(() => agentConfigSchema.parse(raw));
    });
  });

  describe("parseAgentConfig", () => {
    it("parses valid config and returns AgentConfig", () => {
      const raw = {
        id: "parser-test",
        name: "Parser Test",
        type: "hub",
        systemPrompt: "Test prompt",
      };

      const config = parseAgentConfig(raw);
      assert.equal(config.id, "parser-test");
      assert.equal(config.type, "hub");
    });

    it("throws on invalid config", () => {
      assert.throws(() => parseAgentConfig({ id: 123 }));
    });

    it("throws on null", () => {
      assert.throws(() => parseAgentConfig(null));
    });
  });

  describe("createFromTemplate", () => {
    it("creates agent from coder template", () => {
      const agent = createFromTemplate("coder");
      assert.ok(agent);
      assert.equal(agent.id, "coder");
      assert.equal(agent.name, "Coder");
      assert.equal(agent.type, "specialist");
      assert.ok(agent.allowedTools.includes("claude_code"));
      assert.ok(agent.skills.includes("coding"));
      assert.ok(agent.createdAt);
    });

    it("creates agent from researcher template", () => {
      const agent = createFromTemplate("researcher");
      assert.ok(agent);
      assert.equal(agent.id, "researcher");
      assert.ok(agent.allowedTools.includes("web_search"));
    });

    it("creates agent from home template with isolated memory", () => {
      const agent = createFromTemplate("home");
      assert.ok(agent);
      assert.equal(agent.memoryScope, "isolated");
    });

    it("creates agent from scheduler template", () => {
      const agent = createFromTemplate("scheduler");
      assert.ok(agent);
      assert.ok(agent.allowedTools.includes("cron"));
    });

    it("allows custom id override", () => {
      const agent = createFromTemplate("coder", "my-coder");
      assert.ok(agent);
      assert.equal(agent.id, "my-coder");
      assert.equal(agent.name, "Coder"); // Name from template
    });

    it("returns undefined for unknown template", () => {
      const agent = createFromTemplate("nonexistent");
      assert.equal(agent, undefined);
    });
  });

  describe("listTemplates", () => {
    it("returns all available template names", () => {
      const templates = listTemplates();
      assert.ok(templates.includes("coder"));
      assert.ok(templates.includes("researcher"));
      assert.ok(templates.includes("home"));
      assert.ok(templates.includes("scheduler"));
      assert.equal(templates.length, 4);
    });
  });

  describe("SPECIALIST_TEMPLATES", () => {
    it("all templates have required fields", () => {
      for (const [name, template] of SPECIALIST_TEMPLATES) {
        assert.ok(template.name, `${name} missing name`);
        assert.ok(template.systemPrompt, `${name} missing systemPrompt`);
        assert.equal(template.type, "specialist", `${name} should be specialist`);
        assert.ok(Array.isArray(template.allowedTools), `${name} missing allowedTools`);
        assert.ok(Array.isArray(template.skills), `${name} missing skills`);
        assert.ok(template.skills.length > 0, `${name} should have at least one skill`);
      }
    });
  });

  describe("DEFAULT_HUB_CONFIG", () => {
    it("has correct hub configuration", () => {
      assert.equal(DEFAULT_HUB_CONFIG.id, "hub");
      assert.equal(DEFAULT_HUB_CONFIG.type, "hub");
      assert.equal(DEFAULT_HUB_CONFIG.modelId, "local");
      assert.equal(DEFAULT_HUB_CONFIG.memoryScope, "shared");
      assert.equal(DEFAULT_HUB_CONFIG.enabled, true);
      assert.ok(DEFAULT_HUB_CONFIG.systemPrompt.length > 0);
      assert.ok(DEFAULT_HUB_CONFIG.allowedTools.includes("agent_list"));
      assert.ok(DEFAULT_HUB_CONFIG.allowedTools.includes("agent_send"));
      assert.ok(DEFAULT_HUB_CONFIG.allowedTools.includes("agent_history"));
    });
  });

  describe("AGENTS_DIR", () => {
    it("points to data/agents", () => {
      assert.equal(AGENTS_DIR, "data/agents");
    });
  });
});
