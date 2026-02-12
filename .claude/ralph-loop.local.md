---
active: true
iteration: 1
max_iterations: 40
completion_promise: "GEOFREY_BUILD_COMPLETE"
started_at: "2026-02-12T01:35:28Z"
---

You are building geofrey.ai -- a local LLM orchestrator with Telegram integration.

CONTEXT: Read these files FIRST before writing any code:
- CLAUDE.md (project overview, tech stack, conventions, architecture)
- docs/ARCHITECTURE.md (full system architecture, dataflow, risk levels)
- docs/ORCHESTRATOR_PROMPT.md (3 orchestrator prompts: risk classifier, approval formatter, intent)

The project has scaffolding with stub files. Your job is to implement every TODO and wire everything together. Stay INSIDE the project directory at all times.

SUB-AGENT STRATEGY:
You MUST use the Task tool with sub-agents aggressively to parallelize work and research.

Research Agents: Before each phase, spawn an Explore agent to read the relevant source files and node_modules type definitions you will need. On API uncertainty, spawn an Explore agent to read the actual .d.ts files in node_modules -- never guess imports or signatures. On build errors, spawn an Explore agent to find the correct types/exports while you fix other issues in parallel.

Parallel Implementation Agents: Use the Task tool to run independent work streams simultaneously. Launch multiple Task calls in a single message whenever phases are independent.

Parallel Group A (Phase 1 + Phase 3): Phase 1 (Tool Bridge) and Phase 3 (LLM Risk Classification) are independent -- implement both in parallel via sub-agents.

Parallel Group B (Phase 6 + Phase 7 + Phase 8): Phase 6 (Database), Phase 7 (MCP Client), and Phase 8 (Audit Integration) are independent -- run all three in parallel.

How to Use Sub-Agents for Implementation: 1) Give them the FULL file content they need to modify (read it first, pass it in the prompt). 2) Tell them the EXACT function signatures and imports from the API Reference below. 3) Tell them to output the COMPLETE new file content. 4) After they return: write their output to the file, then run pnpm build yourself to verify. 5) If build fails: fix the errors yourself or spawn another agent to investigate.

Sub-Agent Rules: Always spawn Explore agents for research. Launch parallel Task agents for independent phases. The main thread (you) owns build verification, git commits, integration between phases, and error fixing. Sub-agents own file implementation, API research, and type checking.

VERIFICATION RULES (apply after EVERY phase):
1. Run: pnpm build (tsc). It MUST compile with zero errors.
2. Run: pnpm lint (tsc --noEmit). Zero errors.
3. If build fails: read the error, fix it, rebuild. Do NOT move to the next phase until clean.
4. After each phase passes build: git add -A and git commit -m "phase N: description".

TECH STACK (already installed, do NOT run pnpm install):
- ai v6.0.79 (Vercel AI SDK 6) with generateText, streamText, ToolLoopAgent, tool with needsApproval, stopWhen/stepCountIs
- ai-sdk-ollama v3.5.0 with createOllama(options) returning OllamaProvider
- grammy v1.35 with Bot, InlineKeyboard, Context
- better-sqlite3 v11 + drizzle-orm v0.40 (Drizzle ORM over SQLite)
- execa v9.5 for subprocess execution
- zod v3.24 for schema validation
- @modelcontextprotocol/sdk v1 for MCP Client

API REFERENCE (critical -- use these exact signatures, verify against node_modules .d.ts files before using):

Vercel AI SDK 6:
  import { generateText, streamText, tool, ToolLoopAgent, stepCountIs } from "ai";
  import { createOllama } from "ai-sdk-ollama";

  Tool definition with needsApproval:
    tool({ description: "...", parameters: z.object({...}), needsApproval: (input) => boolean, execute: async (input) => {...} })

  Agent with auto tool loop:
    const agent = new ToolLoopAgent({ id: "orchestrator", model: ollama("qwen3:8b"), instructions: SYSTEM_PROMPT, tools: { read_file: ..., shell_exec: ... }, stopWhen: stepCountIs(15), onStepFinish: (step) => { ... } });
    const result = await agent.generate({ prompt: "...", messages: [...] });

  streamText for Telegram streaming:
    const result = streamText({ model: ollama("qwen3:8b"), system: SYSTEM_PROMPT, messages, tools, stopWhen: stepCountIs(15), onChunk: ({ chunk }) => { ... }, onStepFinish: (step) => { ... } });
    for await (const chunk of result.textStream) { ... }

Ollama Provider:
  const ollama = createOllama({ baseURL: "http://localhost:11434" });
  const model = ollama("qwen3:8b", { options: { num_ctx: 16384 }, think: true });

MCP Client:
  import { Client } from "@modelcontextprotocol/sdk/client/index.js";
  import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
  const transport = new StdioClientTransport({ command: "...", args: [...] });
  const client = new Client({ name: "geofrey", version: "0.1.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const result = await client.callTool({ name: "...", arguments: {...} });
  await client.close();

PHASE 0: Rename + Git Remote (sequential, quick)
1. In package.json: change name from openclaw-nur-besser to geofrey-ai.
2. In src/index.ts: change the startup log to geofrey.ai starting...
3. Verify remote exists: git remote -v. If origin not set, add: git remote add origin https://github.com/slavko-at-klincov-it/geofrey.ai.git
4. Build + commit.

PHASE 1+3 PARALLEL: Tool Bridge + LLM Risk Classification
Spawn TWO sub-agents simultaneously:

Sub-Agent A -- Phase 1: Tool Registry to AI SDK Tools Bridge
The existing tool-registry.ts uses a custom ToolDefinition interface with Zod schemas and execute functions. Bridge this to Vercel AI SDK 6 tool() format.
In src/tools/tool-registry.ts: Add a function getAiSdkTools() that converts all registered tools to AI SDK tool() format. Each tool gets needsApproval based on synchronous risk classification (use classifyDeterministic from risk-classifier). If deterministic classification returns L2, needsApproval returns true. If deterministic returns L3, the execute function should throw/refuse. If deterministic returns null (ambiguous), needsApproval returns true (safe default). The execute function should: classify risk, check execution guard, execute, then audit log.

Sub-Agent B -- Phase 3: LLM Risk Classification
Implement classifyWithLlm() in src/approval/risk-classifier.ts. Use Prompt 1 (Risk Classifier) from docs/ORCHESTRATOR_PROMPT.md. Call generateText with the Ollama model, Prompt 1 as system, the tool call info as user message. Parse the JSON response with level L0/L1/L2/L3 and reason. If parsing fails, default to L2.

After both return: Write both files, run pnpm build, fix any integration issues, commit: phase 1+3: tool bridge + LLM risk classification.

PHASE 2: Agent Loop (Core Orchestration)
Rewrite src/orchestrator/agent-loop.ts to use ToolLoopAgent or generateText with stopWhen.
First, spawn an Explore agent to read the exact ToolLoopAgent type definition from node_modules/ai/dist/index.d.mts -- confirm the constructor signature, .generate() params, and how needsApproval integrates with the loop.
Then implement:
1. Create the orchestrator using Prompt 3 (Intent Classifier) from docs/ORCHESTRATOR_PROMPT.md as the system prompt.
2. Use generateText with: model ollama(config.ollama.model, { options: { num_ctx: config.ollama.numCtx } }), tools from getAiSdkTools(), stopWhen stepCountIs(config.limits.maxAgentSteps), onStepFinish callback that logs each step and writes audit entries.
3. Handle the approval flow: When a tool has needsApproval returning true, the loop pauses. Create a pending approval via createApproval(). Send Telegram approval message via formatApproval() + bot API. Await the Promise from createApproval() -- this structurally blocks. If approved: continue execution. If denied: skip tool, inform model.
4. Export runAgentLoop(config, chatId, userMessage, bot) that: gets/creates conversation from conversation manager, adds user message to history, calls generateText with full message history, adds assistant response to history, returns the response text.
5. Build + commit.

PHASE 4: Telegram Bot to Agent Loop Wiring
Wire src/messaging/telegram.ts to actually route messages through the agent loop.
1. In the bot.on message:text handler: Call runAgentLoop(config, ctx.chat.id, ctx.message.text, bot). Send the response back via ctx.reply(result.text). Handle errors gracefully: catch, log, reply with error message.
2. Pass the config and bot instance to wherever needed (closure or module-level).
3. For L1 notifications: after tool execution, send a brief info message to the user.
4. Build + commit.

PHASE 5: Streaming Support
Enhance the agent loop to stream tokens to Telegram.
1. In agent-loop.ts, add a runAgentLoopStreaming variant that uses streamText instead of generateText.
2. Use the existing createStream from src/messaging/streamer.ts to: Start a placeholder message in Telegram. Append chunks from result.textStream via stream.append(). Call stream.finish() when done.
3. In telegram.ts, use the streaming variant for text message handling.
4. Build + commit.

PHASE 6+7+8 PARALLEL: Database + MCP + Audit
Spawn THREE sub-agents simultaneously:

Sub-Agent A -- Phase 6: Database Integration
Wire up SQLite + Drizzle for persistent conversations.
1. In src/index.ts: Call getDb(config.database.url) at startup. Call closeDb() in the shutdown handler. Ensure data/ directory exists (mkdir -p).
2. Generate Drizzle migrations: after build, check if drizzle/ has migration files. If not, use drizzle-kit push or programmatic table creation.
3. In src/orchestrator/conversation.ts: On getOrCreate() check SQLite first, fall back to creating new. On addMessage() persist to SQLite. On getHistory() load from SQLite if not in memory.
4. In src/approval/approval-gate.ts: On createApproval() persist to pendingApprovals table. On resolveApproval() update status + resolvedAt.

Sub-Agent B -- Phase 7: MCP Client
Implement src/tools/mcp-client.ts for MCP server integration.
1. Use @modelcontextprotocol/sdk Client + StdioClientTransport.
2. Add a config field for MCP servers (array of name, command, args, env).
3. connectMcpServer(config): Spawn the MCP server via StdioClientTransport. List tools via client.listTools(). For each MCP tool register it via registerTool() with source mcp. The execute function calls client.callTool().
4. disconnectAll(): close all connected MCP clients.
5. Store active clients in a module-level Map.

Sub-Agent C -- Phase 8: Audit Log Integration
Wire the audit log into the tool execution flow.
1. In the tool execution wrapper (from Phase 1 bridge): After each tool execution, call appendAuditEntry(). Include: toolName, toolArgs, riskLevel, approved (true/false), result (truncated), userId.
2. In src/index.ts: ensure audit log directory exists on startup.

After all three return: Write all files, run pnpm build, resolve any conflicts between the three agents changes to shared files (especially index.ts), commit: phase 6+7+8: database + MCP + audit integration.

PHASE 9: Health Checks + Startup Sequence
1. In src/index.ts, before starting the bot: Health check Ollama by fetching the baseUrl/api/tags endpoint -- if fails, log warning but do not crash (Ollama might start later). Ensure data/ and data/audit/ directories exist. Initialize DB + run migrations. Connect MCP servers (if configured).
2. In shutdown: Wait for in-flight tool executions (add a simple counter/tracker). Close DB connection. Flush audit log (ensure last write completes).
3. Build + commit.

PHASE 10: Final Integration + Push
Spawn an Explore agent to read ALL source files and check for remaining TODOs, broken imports, or type issues. In parallel, you verify build.
1. Run pnpm build -- zero errors.
2. Read through ALL source files and verify: No remaining TODOs that should be implemented. All imports resolve correctly. Type safety is maintained (no any casts unless absolutely necessary). The startup log says geofrey.ai not openClawNurBesser.
3. Update CLAUDE.md: Check off completed items in Project Status. Update any outdated information.
4. Final commit: git add -A and git commit -m "geofrey.ai: full implementation".
5. Push: git push -u origin main.

ERROR RECOVERY:
- If pnpm build fails: read the FULL error output. Fix the specific TypeScript error. Rebuild. Spawn an Explore agent to check the .d.ts in node_modules if types are unclear.
- If an import does not resolve: spawn an Explore agent to search node_modules/ for the correct export path. The SDK uses .js extensions in imports (ESM).
- If a type mismatch: spawn an Explore agent to read the .d.ts file in node_modules to get the correct signature.
- If stuck after 3 attempts on the same error: simplify the approach (e.g. use generateText directly instead of ToolLoopAgent). Spawn a research agent to find alternative APIs.
- After 30 iterations without reaching Phase 10: document progress, commit, push what you have.

CONSTRAINTS:
- Stay inside /Users/slavkoklincov/Code/openClawNurBesser/ at all times.
- Do NOT run pnpm install or modify package.json dependencies.
- Do NOT create new top-level directories outside the existing structure.
- Code in English, comments minimal, no docstrings unless complex logic.
- Prefer functions over classes. Use export function, not export class.
- All imports use .js extension (ESM).
- German for user-facing strings (Telegram messages, approval text).
- Use Task tool sub-agents for ALL parallelizable work -- never implement sequentially what can run in parallel.
- Use Explore agents for ALL API research -- never guess type signatures.

When ALL phases are complete and the final push succeeds, output exactly: GEOFREY_BUILD_COMPLETE
