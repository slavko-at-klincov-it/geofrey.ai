# Geofrey — Vollständige Projektanalyse

> Automatisch generierte Analyse aller Module, Abhängigkeiten, Schnittstellen und identifizierter Probleme.

---

## Inhaltsverzeichnis
1. [Entry Point & Lifecycle](#1-entry-point--lifecycle)
2. [Orchestrator](#2-orchestrator)
3. [Approval System](#3-approval-system)
4. [Tools](#4-tools)
5. [Messaging](#5-messaging)
6. [Security](#6-security)
7. [Audit](#7-audit)
8. [Database](#8-database)
9. [Config](#9-config)
10. [i18n](#10-i18n)
11. [Onboarding](#11-onboarding)
12. [Indexer](#12-indexer)
13. [Globaler Abhängigkeitsgraph](#13-globaler-abhängigkeitsgraph)
14. [State Management Übersicht](#14-state-management-übersicht)
15. [FEHLER & LÜCKEN](#15-fehler--lücken)

---

## 1. Entry Point & Lifecycle

### `src/index.ts`

**Exports:** `trackInflight(delta: number)`

**Imports (intern):**
| Modul | Import |
|-------|--------|
| `config/defaults` | `loadConfig` |
| `i18n/index` | `setLocale`, `t` |
| `messaging/create-platform` | `createPlatform` |
| `messaging/platform` | `PlatformCallbacks` (type) |
| `approval/approval-gate` | `rejectAllPending`, `resolveApproval` |
| `tools/mcp-client` | `disconnectAll`, `connectMcpServer` |
| `db/client` | `getDb`, `closeDb` |
| `orchestrator/conversation` | `setDbUrl` |
| `tools/claude-code` | `initClaudeCode` |
| `onboarding/check` | `checkClaudeCodeReady` |
| `orchestrator/agent-loop` | `runAgentLoopStreaming` |

**Side-Effect Imports (Tool Registration):**
```
./tools/filesystem.js     → read_file, write_file, delete_file, list_dir
./tools/shell.js          → shell_exec
./tools/git.js            → git_status, git_log, git_diff, git_commit
./tools/search.js         → search
./tools/claude-code.js    → claude_code
./tools/project-map.js    → project_map
```

### Startup-Sequenz (Reihenfolge)
1. `loadConfig()` → Zod-validierte Config aus ENV
2. `setLocale(config.locale)` → i18n aktivieren
3. `mkdir("data/audit")` → Datenverzeichnisse sicherstellen
4. `getDb(config.database.url)` → SQLite + Drizzle initialisieren
5. `setDbUrl()` → DB-URL an Conversation-Manager übergeben
6. `initClaudeCode(config.claude)` → Claude Code Driver konfigurieren
7. `checkClaudeCodeReady()` → CLI + Auth prüfen
8. `healthCheckOllama()` → 3 Retries gegen Ollama `/api/tags`
9. MCP Servers aus `MCP_SERVERS` ENV verbinden
10. `createPlatform()` → Messaging-Adapter erstellen mit Callbacks
11. `platform.start()` → Long Polling / Webhook starten

### Callbacks (Brücke Messaging → Orchestrator)
```typescript
onMessage(chatId, text) → runAgentLoopStreaming(config, chatId, text, platform)
onApprovalResponse(nonce, approved) → resolveApproval(nonce, approved)
```

### Graceful Shutdown
```
SIGINT/SIGTERM → platform.stop()
                → rejectAllPending("SHUTDOWN")
                → waitForInflight(10s)
                → disconnectAll() [MCP]
                → closeDb()
                → process.exit(0)
```

### In-Flight Tracking
- `trackInflight(+1)` vor Tool-Execution, `trackInflight(-1)` danach (in `tool-registry.ts`)
- `waitForInflight()` pollt alle 200ms bis `inFlightCount === 0` oder Timeout

---

## 2. Orchestrator

### `src/orchestrator/agent-loop.ts`

**Exports:** `runAgentLoop()`, `runAgentLoopStreaming()`

**Imports (intern):**
| Modul | Import |
|-------|--------|
| `config/schema` | `Config` (type) |
| `messaging/platform` | `MessagingPlatform`, `ChatId` (types) |
| `tools/tool-registry` | `getAiSdkTools` |
| `approval/approval-gate` | `createApproval` |
| `approval/risk-classifier` | `classifyRisk`, `classifyDeterministic`, `RiskLevel` |
| `i18n/index` | `t` |
| `orchestrator/conversation` | `getOrCreate`, `addMessage`, `getHistory` |
| `audit/audit-log` | `appendAuditEntry` |
| `messaging/streamer` | `createStream` |
| `tools/claude-code` | `ClaudeResult` (type) |

**Kernfunktionen:**

#### `buildOrchestratorPrompt()` → string
System-Prompt für Qwen3 8B mit:
- Intent-Klassifikation: QUESTION / SIMPLE_TASK / CODING_TASK / AMBIGUOUS
- Tool-Selektion: Direct Tools vs. `claude_code`
- Pre-Investigation: `project_map` + `read_file` + `search` vor `claude_code`
- DATA-Tags: `<tool_output>`, `<mcp_data>`, `<model_response>` als Isolationsgrenze
- Limits: 15 Tool-Calls, 2 Retries, Abbruch bei Loops

#### `buildPrepareStep(config, chatId, platform)` → Vercel AI SDK Hook
Approval-Gate in der Tool-Loop:
1. Scannt letzten Step nach `tool-approval-request` Messages
2. `classifyRisk()` für jeden Tool-Call
3. L3 → auto-reject
4. L2 → `createApproval()` → Promise blockiert bis User antwortet
5. `platform.sendApproval()` → UI an User senden
6. `await promise` → blockiert hier
7. Injiziert `tool-approval-response` zurück an AI SDK

#### `buildOnStepFinish(config, chatId)` → Vercel AI SDK Hook
Audit-Logging nach jeder Tool-Execution:
- `classifyDeterministic()` für Risk-Level
- `appendAuditEntry()` mit Tool-Name, Args, Risk-Level
- Claude Code Enrichment: `lastClaudeResult.get(chatId)` für Session/Cost/Tokens

#### `lastClaudeResult` Map (Modul-Level)
- **Zweck:** Speichert letztes Claude Code Ergebnis pro Chat für Audit-Enrichment
- **⚠️ PROBLEM:** Wird nie befüllt (`lastClaudeResult.set()` existiert nirgends) — siehe [Fehler #1](#f1)

### `src/orchestrator/conversation.ts`

**Exports:** `setDbUrl`, `getOrCreate`, `addMessage`, `getHistory`, `setClaudeSession`, `getClaudeSession`, `clearConversation`

**State:** Dual-Persistence (In-Memory Map + SQLite)
- Reads: Memory-first, DB-Fallback
- Writes: Beide gleichzeitig

**⚠️ PROBLEM:** `setClaudeSession`, `getClaudeSession`, `clearConversation` werden nie in Production aufgerufen — siehe [Fehler #2](#f2)

### `src/orchestrator/prompt-generator.ts`

**Exports:** `generatePrompt`, `scopeToolsForRisk`, `buildClaudeCodePrompt`

8 Task-Templates: bug_fix, refactor, new_feature, code_review, test_writing, debugging, documentation, freeform

**⚠️ PROBLEM:** Gesamtes Modul wird nie in Production aufgerufen — siehe [Fehler #3](#f3)

---

## 3. Approval System

### `src/approval/risk-classifier.ts`

**Exports:** `RiskLevel` (enum), `Classification` (interface), `classifyRisk`, `classifyDeterministic`, `classifyWithLlm`, `decomposeCommand`, `classifySingleCommand`, `riskOrdinal`, `tryParseXmlClassification`, `tryParseClassification`

**Hybrid-Klassifikation:**
- **90% deterministisch:** Regex-Patterns für bekannte Befehle
- **10% LLM-Fallback:** Qwen3 8B für ambige Fälle (XML-Output, JSON-Fallback)
- **Fallback-Fallback:** L2 wenn LLM-Parsing scheitert

**Risk Levels:**
| Level | Verhalten | Beispiele |
|-------|-----------|-----------|
| L0 | Auto-Execute | `read_file`, `list_dir`, `search`, `git_status`, `git_log`, `git_diff`, `project_map` |
| L1 | Execute + Notify | `write_file` (non-config), `git_add` |
| L2 | Blockiert bis Approval | `delete_file`, `git_commit`, `shell_exec`, Config-Files |
| L3 | Immer blockiert | `sudo`, `rm -rf`, `curl`, `wget`, `eval`, Force-Push, Injection-Patterns |

**Command Decomposition:** `decomposeCommand()` splittet auf `&&`, `||`, `;`, `|`, `\n` (quote-aware) → klassifiziert jedes Segment einzeln, höchstes Risk-Level gewinnt.

**L3-Pattern-Abdeckung:**
- Dangerous Commands: `sudo|rm -rf|curl|wget|nc|ssh|eval|exec`
- Path Variants: `/usr/bin/curl`, `./curl`
- Script Network: `python3.*requests`, `node.*http.get`
- Base64 Decode: `base64 -d`, `atob`, `Buffer.from(…,"base64")`
- chmod +x, Process Substitution, Backticks/$(...)
- Force Push, Bare Shell (`curl | sh`), Sensitive Paths (`.env`, `.ssh`)

### `src/approval/approval-gate.ts`

**Exports:** `PendingApproval` (interface), `createApproval`, `resolveApproval`, `getPending`, `rejectAllPending`, `pendingCount`

**Promise-Based Blocking:**
```
createApproval() → { nonce, promise }
   ↓ promise blockiert bis...
resolveApproval(nonce, true/false) → Promise wird resolved
```

- Nonce: 4 Random Bytes (8-char hex)
- Pending Map: `Map<nonce, PendingApproval>`
- Shutdown: `rejectAllPending()` resolved alle mit `false`

**⚠️ PROBLEM:** Kein Timeout auf Approval-Promises — siehe [Fehler #4](#f4)

### `src/approval/execution-guard.ts`

**Exports:** `GuardResult` (interface), `checkExecution`

**⚠️ PROBLEM:** Gesamtes Modul wird nie aufgerufen — siehe [Fehler #5](#f5)

### `src/approval/action-registry.ts`

**Exports:** `ActionDefinition` (interface), `registerAction`, `getAction`, `getAllActions`

**⚠️ PROBLEM:** Gesamtes Modul wird nie importiert — siehe [Fehler #6](#f6)

---

## 4. Tools

### `src/tools/tool-registry.ts`

**Exports:** `ToolDefinition` (interface), `registerTool`, `getTool`, `getAllTools`, `getToolSchemas`, `getAiSdkTools`

**Registrierungsmuster:** Module rufen `registerTool()` bei Import-Time auf → `index.ts` importiert alle Tool-Module als Side-Effects.

**`getAiSdkTools()`** — Konvertiert alle registrierten Tools zu Vercel AI SDK Format:
- `needsApproval` Hook: `classifyDeterministic()` → `true` für L2/L3 oder unbekannt
- `execute` Wrapper: L3-Block, `trackInflight()`, Error-Handling

**⚠️ PROBLEM:** `getTool`, `getAllTools`, `getToolSchemas` werden nie aufgerufen — siehe [Fehler #7](#f7)

### `src/tools/claude-code.ts`

**Exports:** `StreamEvent`, `ClaudeInvocation`, `ClaudeResult` (types), `initClaudeCode`, `invokeClaudeCode`, `buildClaudeArgs`, `parseStreamJson`

**Subprocess-Management:**
- `execa("claude", args)` mit konfigurierbarem Timeout (default 600s)
- ENV: `CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000`, optional `ANTHROPIC_API_KEY`
- Output-Formate: `json`, `stream-json`, `text`

**Session-Management:**
- `taskKey` → `sessionId` Map (TTL-basiert, default 1h)
- Ermöglicht Multi-Turn Claude Code Conversations

**Token Limit Retry:**
- Erkennt Output-Token-Limit via Regex
- Retry mit `CONCISE_SUFFIX` angehängt

**Streaming Callbacks:** `onText`, `onToolUse`, `onToolResult`

**⚠️ PROBLEM:** Dead Code in `runClaudeProcess()` — `TextDecoderStream` und `readable` Variable werden erstellt aber nie benutzt (Zeilen 290-291) — siehe [Fehler #8](#f8)

### `src/tools/filesystem.ts`

4 Tools: `read_file` (L0), `write_file` (L1), `delete_file` (L2), `list_dir` (L0)

**Security:** `confine(path)` → `resolve()` + `startsWith(process.cwd())` gegen Path Traversal

**⚠️ PROBLEM:** `confine()` nutzt `process.cwd()` das sich theoretisch ändern kann — siehe [Fehler #9](#f9)

### `src/tools/shell.ts`
1 Tool: `shell_exec` (L2) — Windows: `cmd /c`, Unix: `sh -c`, Timeout 30s

### `src/tools/git.ts`
4 Tools: `git_status` (L0), `git_log` (L0), `git_diff` (L0), `git_commit` (L2)

### `src/tools/search.ts`
1 Tool: `search` (L0) — Recursive Dir-Walk, Regex, max 20 Results

### `src/tools/project-map.ts`
1 Tool: `project_map` (L0) — Liest `.geofrey/project-map.json`, filtert per Query/Category

### `src/tools/mcp-client.ts`

**Exports:** `sanitizeMcpOutput`, `setAllowedServers`, `connectMcpServer`, `disconnectAll`, `McpServerConfig`

**MCP Integration:**
- `StdioClientTransport` → MCP Server als Subprocess
- Tool-Discovery: `client.listTools()` → `registerTool()` mit Prefix `{server}:{tool}`
- Zod-Validierung der Response (`mcpContentSchema.safeParse()`)
- Output-Sanitization: Instruction-Patterns filtern, `<mcp_data>` Tags

**⚠️ PROBLEM:** `setAllowedServers()` wird nie aufgerufen — `config.mcp.allowedServers` wird nie angewendet — siehe [Fehler #10](#f10)

---

## 5. Messaging

### `src/messaging/platform.ts`

**Exports (Abstraktion):**
```typescript
interface MessagingPlatform {
  readonly name: "telegram" | "whatsapp" | "signal";
  readonly maxMessageLength: number;
  readonly supportsEdit: boolean;
  sendMessage(chatId, text): Promise<MessageRef>;
  editMessage(chatId, ref, text): Promise<MessageRef>;
  sendApproval(chatId, nonce, toolName, args, classification): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface PlatformCallbacks {
  onMessage(chatId, text): Promise<void>;
  onApprovalResponse(nonce, approved): Promise<void>;
}
```

### `src/messaging/create-platform.ts`
Factory: `config.platform` → dynamischer Import → Adapter-Instanz

### `src/messaging/streamer.ts`

**Exports:** `StreamState`, `createStream`, `createClaudeCodeStream`

**`createStream()`** — Generisches Text-Streaming:
- `start()` → Placeholder-Message ("...")
- `append(chunk)` → Buffer + Throttled Edit (1s)
- `finish()` → Final Flush

**`createClaudeCodeStream()`** — Claude Code Events → Platform Updates:
- `assistant` → Text anhängen
- `tool_use` → `> toolName...`
- `result` → Buffer ersetzen mit Endergebnis

**⚠️ PROBLEM:** `createClaudeCodeStream()` wird nie in Production verwendet — siehe [Fehler #11](#f11)

### Adapter-Vergleich

| Feature | Telegram | WhatsApp | Signal |
|---------|----------|----------|--------|
| Transport | Long Polling (grammY) | Webhook (HTTP Server) | JSON-RPC Socket |
| Edit Support | ✅ | ❌ | ❌ |
| Approval UI | Inline Keyboard | Interactive Buttons (max 3) | Text ("1 = Genehmigen, 2 = Ablehnen") |
| Max Message | 4096 | 4096 | 2000 |
| Auth | Bot Token | Bearer + HMAC-SHA256 | Phone Numbers |
| Owner Check | `ctx.from.id === ownerId` | Normalized Phone Match | Exact Phone Match |

---

## 6. Security

### `src/security/image-sanitizer.ts`

**Exports:** `SupportedFormat`, `SuspiciousFinding`, `SanitizationReport`, `SanitizeResult`, `ImageSanitizeError`, `ImageSanitizeErrorCode`, `detectFormat`, `scanMetadataForInjection`, `sanitizeImage`, `buildSanitizeAuditEntry`

**Pipeline:** Input Buffer → Size Check → Format Detection (Magic Bytes) → Read EXIF/XMP/IPTC → Scan for Injection Patterns → Strip Metadata + Apply Orientation → Output Buffer

**Injection Patterns:**
- Instruction: "you must", "please execute", "run the command"
- XML: `<system>`, `<instruction>`, `<prompt>`, `<command>`
- Jailbreak: "ignore previous instructions", "new system prompt", "act as", "DAN"
- Bypass: "disregard instructions", "do not follow rules"

**⚠️ PROBLEM:** Image Sanitizer ist nirgends in den Messaging-Pipeline integriert — siehe [Fehler #12](#f12)

---

## 7. Audit

### `src/audit/audit-log.ts`

**Exports:** `AuditEntry`, `appendAuditEntry`, `verifyChain`

**Hash-Chain:**
- `lastHash` beginnt bei `"GENESIS"` (Modul-Level)
- Jeder Eintrag: `prevHash = lastHash`, `hash = SHA-256(entry + prevHash)`
- JSONL-Dateien pro Tag: `{logDir}/{YYYY-MM-DD}.jsonl`

**AuditEntry Felder:** timestamp, action, toolName, toolArgs, riskLevel, approved, result, userId, claudeSessionId?, claudeModel?, costUsd?, tokensUsed?, allowedTools?

**⚠️ PROBLEM:** Hash-Chain bricht bei Prozess-Neustart — siehe [Fehler #13](#f13)
**⚠️ PROBLEM:** Keine Audit-Einträge für abgelehnte/L3-blockierte Tool-Calls — siehe [Fehler #14](#f14)

---

## 8. Database

### `src/db/client.ts`

**Exports:** `getDb`, `closeDb`

**Singleton-Pattern:**
- `better-sqlite3` mit WAL-Mode + Foreign Keys
- Drizzle ORM Wrapper
- Migrations aus `./drizzle`
- `schema_version` Table für Future Migrations

### `src/db/schema.ts`

**Tabellen:**
| Tabelle | Zweck | Relationen |
|---------|-------|------------|
| `conversations` | Chat-Tracking | — |
| `messages` | Nachrichtenverlauf | → `conversations.id` |
| `pendingApprovals` | Approval-Workflow | → `conversations.id` |

**⚠️ PROBLEM:** `pendingApprovals` Tabelle wird nie verwendet — Approvals sind rein in-memory — siehe [Fehler #15](#f15)

---

## 9. Config

### `src/config/schema.ts`

**Top-Level Sections:**
| Section | Felder |
|---------|--------|
| `locale` | `"de" \| "en"` (default `"de"`) |
| `platform` | `"telegram" \| "whatsapp" \| "signal"` |
| `telegram` | `botToken`, `ownerId` |
| `whatsapp?` | `phoneNumberId`, `accessToken`, `verifyToken`, `ownerPhone`, `webhookPort` |
| `signal?` | `signalCliSocket`, `ownerPhone`, `botPhone` |
| `ollama` | `baseUrl`, `model`, `numCtx` |
| `database` | `url` |
| `audit` | `logDir` |
| `limits` | `maxAgentSteps`, `approvalTimeoutMs`, `maxConsecutiveErrors` |
| `claude` | `enabled`, `skipPermissions`, `outputFormat`, `maxBudgetUsd`, `model`, `sessionTtlMs`, `timeoutMs`, `defaultDirs`, `apiKey`, `mcpConfigPath`, `toolProfiles` |
| `imageSanitizer` | `enabled`, `maxInputSizeBytes`, `scanForInjection` |
| `mcp` | `allowedServers` |

**Refine:** Prüft dass WhatsApp-Config existiert wenn `platform: "whatsapp"`, ebenso Signal.

### `src/config/defaults.ts`

`loadConfig()` → Liest ENV-Vars → Baut Objekt → `configSchema.parse()` → menschenlesbare Fehler bei Validation-Failure

---

## 10. i18n

### `src/i18n/index.ts`

**Exports:** `Locale`, `TranslationKey`, `setLocale`, `getLocale`, `t`

**Pattern:** `t(key, params?)` → Lookup in `locales[currentLocale][key]` → Fallback DE → Fallback Key → Parameter-Substitution `{name}` → Wert

### `src/i18n/keys.ts`
~237 typisierte Keys als Union Type. `satisfies Record<TranslationKey, string>` in Locale-Files erzwingt Vollständigkeit zur Compile-Time.

### `src/i18n/locales/de.ts` & `en.ts`
Vollständige Übersetzungsmaps. Code-Begriffe (Commands, API Keys) bleiben auf Englisch.

---

## 11. Onboarding

### `src/onboarding/check.ts`
**Startup-Check:** Claude CLI verfügbar? Auth OK? → `OnboardingResult { ready, authMethod, message }`

### `src/onboarding/setup.ts` → `pnpm setup`
CLI-Einstiegspunkt → `runWizard()` → Erfolg → optional `pnpm dev`

### `src/onboarding/wizard.ts`
**Wizard-Flow:**
1. Sprache wählen (bilingual)
2. Prerequisites prüfen (Node ≥22, pnpm, Ollama, Model, Claude CLI)
3. Platform wählen
4. Platform-Setup (Token/Credentials)
5. Claude Auth (API Key / Subscription / Skip)
6. Summary + `.env` generieren

### Steps
| Step | File | Funktion |
|------|------|----------|
| Prerequisites | `steps/prerequisites.ts` | Node, pnpm, Ollama, Model, CLI Checks |
| Platform | `steps/platform.ts` | Telegram/WhatsApp/Signal Choice |
| Telegram | `steps/telegram.ts` | Token (Direct/Clipboard/OCR), Owner-ID Auto-Detection |
| WhatsApp | `steps/whatsapp.ts` | Phone ID, Token, Validation, Webhook Port |
| Signal | `steps/signal.ts` | Socket-Path, JSON-RPC Validation |
| Claude Auth | `steps/claude-auth.ts` | API Key / Subscription / Skip |
| Summary | `steps/summary.ts` | `.env` Generation + Backup |

### Utils
| File | Zweck |
|------|-------|
| `utils/ui.ts` | chalk + ora Formatting |
| `utils/prompt.ts` | @inquirer/prompts Wrapper (German) |
| `utils/validate.ts` | Token/Credential Validators (API Calls) |
| `utils/clipboard.ts` | clipboardy Token Extraction |
| `utils/ocr.ts` | tesseract.js Screenshot → Token |

---

## 12. Indexer

### `src/indexer/index.ts` → `pnpm index`

**Generiert:** `.geofrey/project-map.json`

**Incremental Parsing:**
- File-Discovery: `src/**/*.ts` (exkl. `*.d.ts`, `node_modules`, `dist`)
- Cache: `mtimeMs`-Vergleich → nur geänderte Files neu parsen
- AST-Parsing via TypeScript Compiler API

**Output:**
```json
{
  "version": 1,
  "generatedAt": "2026-02-13T...",
  "fileCount": 87,
  "files": {
    "src/tools/filesystem.ts": {
      "summary": "Tools: readFile, writeFile, deleteFile (function)",
      "exports": [...],
      "imports": [...],
      "mtimeMs": 1739...,
      "lines": 59,
      "isTest": false,
      "category": "Tools"
    }
  }
}
```

### `src/indexer/parser.ts`
TypeScript AST → Exports (name, kind, isDefault) + Imports (source, specifiers, isTypeOnly) + Leading Comment

### `src/indexer/summary.ts`
`deriveCategory()` → Directory-Name zu freundlichem Namen
`generateSummary()` → Test? → JSDoc? → Export-Liste? → Fallback

---

## 13. Globaler Abhängigkeitsgraph

### Datenfluss: User Message → Response
```
User (Telegram/WhatsApp/Signal)
  ↓ onMessage callback
index.ts
  ↓
agent-loop.ts: runAgentLoopStreaming()
  ├── conversation.ts: getOrCreate() + addMessage()
  ├── tool-registry.ts: getAiSdkTools()
  ├── streamer.ts: createStream()
  └── Vercel AI SDK: streamText()
       ├── Ollama (Qwen3 8B)
       └── Tools
            ├── prepareStep Hook
            │    ├── risk-classifier.ts: classifyRisk()
            │    ├── approval-gate.ts: createApproval()
            │    └── platform.sendApproval() → User
            ├── execute (wenn approved)
            │    ├── filesystem.ts / shell.ts / git.ts / search.ts
            │    ├── claude-code.ts → execa("claude", ...)
            │    ├── project-map.ts → .geofrey/project-map.json
            │    └── mcp-client.ts → MCP Tool Execution
            └── onStepFinish Hook
                 └── audit-log.ts: appendAuditEntry()
  ↓
streamer.ts: append() → finish()
  ↓
platform.editMessage() / sendMessage()
  ↓
User (Telegram/WhatsApp/Signal)
```

### Approval-Flow (L2)
```
prepareStep → classifyRisk() → L2
  ↓
createApproval() → { nonce, Promise }
  ↓
platform.sendApproval() → Telegram Buttons / WhatsApp Buttons / Signal Text
  ↓ ⏳ blockiert
User klickt "Approve"
  ↓
Adapter → callbacks.onApprovalResponse(nonce, true)
  ↓
resolveApproval(nonce, true) → Promise resolved
  ↓
prepareStep returned → Tool wird ausgeführt
```

### Modul-Abhängigkeiten
```
index.ts ──────┬── config/defaults ── config/schema
               ├── i18n/index ── keys, locales/*
               ├── db/client ── db/schema
               ├── messaging/create-platform ── adapters/*
               ├── onboarding/check
               ├── tools/mcp-client ── tool-registry
               ├── tools/* ── tool-registry
               └── orchestrator/agent-loop
                    ├── orchestrator/conversation ── db/*
                    ├── tools/tool-registry ── approval/risk-classifier
                    ├── approval/approval-gate ── approval/risk-classifier
                    ├── messaging/streamer
                    └── audit/audit-log
```

---

## 14. State Management Übersicht

| Modul | State | Scope | Persistenz |
|-------|-------|-------|------------|
| `conversation.ts` | `active` Map\<chatId, Conversation\> | Modul | Memory + SQLite |
| `approval-gate.ts` | `pending` Map\<nonce, PendingApproval\> | Modul | Memory only |
| `claude-code.ts` | `sessions` Map\<taskKey, Session\> | Modul | Memory only |
| `claude-code.ts` | `claudeConfig` | Modul | Memory only |
| `agent-loop.ts` | `lastClaudeResult` Map\<chatId, ClaudeResult\> | Modul | Memory only |
| `mcp-client.ts` | `activeConnections` Map\<name, Connection\> | Modul | Memory only |
| `tool-registry.ts` | `tools` Map\<name, ToolDefinition\> | Modul | Memory only |
| `index.ts` | `inFlightCount` | Modul | Memory only |
| `audit-log.ts` | `lastHash` | Modul | Memory only |
| `db/client.ts` | `db`, `sqlite` Singleton | Modul | SQLite (WAL) |
| `i18n/index.ts` | `currentLocale` | Modul | Memory only |

---

## 15. FEHLER & LÜCKEN

### A. Fehlende Brücken / Nicht-verdrahtete Logik

<a id="f1"></a>
#### F1: `lastClaudeResult` wird nie befüllt (KRITISCH)
**Datei:** `src/orchestrator/agent-loop.ts:162`
**Problem:** `lastClaudeResult` Map wird `.get()` und `.delete()` aufgerufen (Zeilen 183-191), aber `lastClaudeResult.set()` existiert nirgendwo im Code. Die Map ist immer leer.
**Auswirkung:** Audit-Einträge für `claude_code` Tool-Calls enthalten nie `claudeSessionId`, `claudeModel`, `costUsd`, `tokensUsed`, `allowedTools`. Kosten-Tracking ist komplett blind.
**Fix:** In der `claude_code` Tool-Execute-Funktion (claude-code.ts:391-397) muss das `ClaudeResult` in `lastClaudeResult` gesetzt werden, oder der `onStepFinish` Hook braucht einen anderen Zugangsweg zu den Ergebnissen.

<a id="f3"></a>
#### F3: `prompt-generator.ts` komplett ungenutzt (MITTEL)
**Datei:** `src/orchestrator/prompt-generator.ts`
**Problem:** `generatePrompt()`, `scopeToolsForRisk()`, und `buildClaudeCodePrompt()` werden in Production nie aufgerufen (nur Tests). Das gesamte Template-System, die Risk-scoped Tool Profiles, und die strukturierten XML-Prompts für Claude Code existieren nur als Dead Code.
**Auswirkung:** Der Orchestrator übergibt rohe Prompts an `claude_code` ohne die designten Templates und Tool-Scoping. Claude Code bekommt immer volle Berechtigungen statt risk-scoped Profiles.
**Fix:** `agent-loop.ts` sollte `buildClaudeCodePrompt()` nutzen wenn der Orchestrator `claude_code` aufruft, um strukturierte Prompts und Tool-Scoping zu verwenden.

<a id="f4"></a>
#### F4: Kein Timeout auf Approval-Promises (KRITISCH)
**Datei:** `src/approval/approval-gate.ts`
**Problem:** `config.limits.approvalTimeoutMs` (default 300.000ms = 5 min) ist definiert, wird aber nirgends verwendet. Wenn ein User nie auf Approve/Deny klickt, blockiert die Promise für immer. Der Agent-Loop hängt, der Chat ist tot.
**Auswirkung:** Ein vergessener Approval-Request blockiert den gesamten Chat permanent. Kein Recovery-Mechanismus.
**Fix:** `createApproval()` sollte ein `setTimeout` nutzen das die Promise nach `approvalTimeoutMs` mit `false` resolved und den Eintrag aus der Map entfernt.

<a id="f10"></a>
#### F10: MCP Server Allowlist nie angewendet (MITTEL)
**Datei:** `src/tools/mcp-client.ts:17`, `src/index.ts`
**Problem:** `setAllowedServers()` ist exportiert aber wird in `index.ts` nie aufgerufen. `config.mcp.allowedServers` wird zwar geparsed, aber nie an die MCP-Client-Logik übergeben.
**Auswirkung:** MCP Server Allowlist ist wirkungslos — alle Server werden akzeptiert, unabhängig von der Konfiguration.
**Fix:** In `index.ts` nach dem Config-Load `setAllowedServers(config.mcp.allowedServers)` aufrufen, vor MCP-Verbindungen.

<a id="f11"></a>
#### F11: `createClaudeCodeStream()` nie integriert (MITTEL)
**Datei:** `src/messaging/streamer.ts:96`
**Problem:** Die Funktion existiert und ist getestet, wird aber nie in Production aufgerufen. Claude Code Streaming-Events (`onText`, `onToolUse`) werden nicht an die Messaging-Platform weitergeleitet.
**Auswirkung:** User sehen keine Live-Updates während Claude Code arbeitet. Kein Tool-Use Indikator, kein progressives Text-Update.
**Fix:** In der `claude_code` Tool-Execute-Funktion `createClaudeCodeStream()` nutzen und die Streaming-Callbacks verdrahten.

<a id="f12"></a>
#### F12: Image Sanitizer nicht integriert (NIEDRIG)
**Datei:** `src/security/image-sanitizer.ts`
**Problem:** Komplett standalone — kein Import in Messaging-Adaptern. Bilder die User senden werden nicht sanitized.
**Auswirkung:** EXIF/XMP/IPTC Metadaten in User-Bildern werden nicht gestripped. Prompt-Injection via Metadaten theoretisch möglich (wenn Bilder jemals an LLM gesendet werden).
**Fix:** In Messaging-Adaptern (wenn Bild-Support hinzugefügt wird) `sanitizeImage()` vor dem LLM-Call aufrufen.

### B. Dead Code / Ungenutzte Module

<a id="f2"></a>
#### F2: Ungenutzte Exports in conversation.ts
**Datei:** `src/orchestrator/conversation.ts`
**Funktionen:** `setClaudeSession()`, `getClaudeSession()`, `clearConversation()`
**Status:** Nur in Tests aufgerufen, nie in Production.

<a id="f5"></a>
#### F5: execution-guard.ts komplett ungenutzt
**Datei:** `src/approval/execution-guard.ts`
**Problem:** `checkExecution()` wird nirgends aufgerufen (nur eigener Test). Obwohl als "Final Safety Net" designed, fehlt die Integration in den Tool-Execution-Pfad.
**Bemerkung:** Die Logik ist in `prepareStep` und `tool-registry.ts` bereits inline implementiert, aber ohne die Revocation-Prüfung die `execution-guard.ts` bietet.

<a id="f6"></a>
#### F6: action-registry.ts komplett ungenutzt
**Datei:** `src/approval/action-registry.ts`
**Problem:** Kein einziger Import existiert. Das Modul registriert 8 Actions die nie abgefragt werden.
**Bemerkung:** War vermutlich als deklarativer Approach für Risk-Defaults gedacht, wurde aber durch die Regex-Patterns in `risk-classifier.ts` ersetzt.

<a id="f7"></a>
#### F7: Ungenutzte Registry-Exports
**Datei:** `src/tools/tool-registry.ts`
**Funktionen:** `getTool()`, `getAllTools()`, `getToolSchemas()`
**Status:** Nie in Production aufgerufen. Nur `registerTool()` und `getAiSdkTools()` werden genutzt.

<a id="f8"></a>
#### F8: Dead Code in claude-code.ts
**Datei:** `src/tools/claude-code.ts:290-291`
```typescript
const textDecoder = new TextDecoderStream();            // ← nie benutzt
const readable = proc.stdout as unknown as ...;          // ← nie benutzt
```
**Problem:** Beide Variablen werden erstellt aber nie referenziert. Relikte einer früheren Streaming-Implementierung.

#### Nicht-streaming Agent Loop
**Datei:** `src/orchestrator/agent-loop.ts:200`
**Funktion:** `runAgentLoop()` (non-streaming Version) ist exportiert aber wird nie aufgerufen. Nur `runAgentLoopStreaming()` wird in `index.ts` verwendet.

### C. Logische Probleme

<a id="f9"></a>
#### F9: `confine()` nutzt dynamischen `process.cwd()`
**Datei:** `src/tools/filesystem.ts:6-13`
**Problem:** `process.cwd()` kann sich theoretisch ändern (wenn ein anderer Code `process.chdir()` aufruft). Besser wäre ein fixierter Rootpfad aus der Config.
**Risiko:** Niedrig (kein Code im Projekt ruft `chdir()` auf), aber defensiv wäre eine Config-basierte Root-Variable besser.

<a id="f13"></a>
#### F13: Audit Hash-Chain bricht bei Neustart
**Datei:** `src/audit/audit-log.ts:26`
**Problem:** `lastHash` beginnt bei `"GENESIS"` (Modul-Level). Nach Prozess-Neustart startet die Chain wieder bei "GENESIS" statt beim letzten Hash der vorherigen Datei.
**Auswirkung:**
- Innerhalb eines Tags: `verifyChain()` funktioniert nur wenn der Prozess seit Tagesbeginn nicht neu gestartet wurde
- Multi-Tag: Cross-Day-Verification ist unmöglich da jeder Tag isoliert bei "GENESIS" startet
**Fix:** Beim Start die letzte JSONL-Datei lesen und `lastHash` auf den letzten Hash setzen.

<a id="f14"></a>
#### F14: Keine Audit-Einträge für abgelehnte Actions
**Datei:** `src/orchestrator/agent-loop.ts:164-197`
**Problem:** `onStepFinish` loggt nur ausgeführte Tool-Calls (`approved: true`). Abgelehnte L2 und blockierte L3 Calls werden nicht geloggt.
**Auswirkung:** Audit-Log ist unvollständig — man sieht nicht was versucht aber verhindert wurde. Für Security-Audits kritisch.
**Fix:** In `buildPrepareStep()` einen Audit-Eintrag mit `approved: false` erstellen wenn ein Tool L3-blockiert oder User-denied wird.

<a id="f15"></a>
#### F15: `pendingApprovals` DB-Tabelle ungenutzt
**Datei:** `src/db/schema.ts:21-36`
**Problem:** Tabelle ist definiert mit allen nötigen Feldern (nonce, status, resolvedAt), wird aber nie beschrieben oder gelesen. Approvals leben rein im Memory.
**Auswirkung:**
- Approvals gehen bei Prozess-Neustart verloren
- Kein Audit-Trail für Approval-Entscheidungen in der DB
- Schema-Bloat
**Fix:** Entweder `approval-gate.ts` um DB-Persistenz erweitern, oder Tabelle entfernen.

#### F16: Conversation History wächst unbegrenzt
**Datei:** `src/orchestrator/conversation.ts`
**Problem:** `addMessage()` fügt Messages ohne Limit hinzu. Kein Mechanism zum Trimmen alter Messages. Bei langen Chats wird die Message-Liste sehr groß.
**Auswirkung:** Memory-Wachstum über Zeit, und Ollama Context-Window wird mit zu vielen Messages überladen (obwohl `numCtx` ein Token-Limit setzt, wird das Message-Array nicht getrimmt).
**Fix:** History auf letzte N Messages begrenzen, oder ältere Messages zusammenfassen.

#### F17: `maxConsecutiveErrors` nie implementiert
**Datei:** `src/config/schema.ts:41`
**Problem:** Config-Feld existiert (default 3), wird aber nirgends verwendet. Kein Error-Counter im Agent-Loop.
**Auswirkung:** Wenn Tools repeatedly feilen, stoppt der Agent-Loop nicht — er läuft bis `maxAgentSteps` erreicht ist.

### D. Zusammenfassung der Prioritäten

| Prio | # | Problem | Aufwand |
|------|---|---------|---------|
| 🔴 KRITISCH | F1 | `lastClaudeResult` nie befüllt → Kosten-Tracking blind | Klein |
| 🔴 KRITISCH | F4 | Kein Approval-Timeout → Chat kann permanent blockieren | Klein |
| 🟡 MITTEL | F3 | `prompt-generator.ts` nicht verdrahtet → kein Tool-Scoping | Mittel |
| 🟡 MITTEL | F10 | MCP Allowlist nicht angewendet | Klein |
| 🟡 MITTEL | F11 | Claude Code Streaming nicht integriert | Mittel |
| 🟡 MITTEL | F13 | Audit Hash-Chain bricht bei Neustart | Klein |
| 🟡 MITTEL | F14 | Keine Audit-Einträge für Denials | Klein |
| 🟡 MITTEL | F15 | `pendingApprovals` DB-Tabelle ungenutzt | Klein |
| 🟡 MITTEL | F17 | `maxConsecutiveErrors` nicht implementiert | Klein |
| 🟢 NIEDRIG | F2 | Ungenutzte Conversation-Exports | Trivial |
| 🟢 NIEDRIG | F5 | execution-guard.ts ungenutzt | Trivial |
| 🟢 NIEDRIG | F6 | action-registry.ts ungenutzt | Trivial |
| 🟢 NIEDRIG | F7 | Ungenutzte Registry-Exports | Trivial |
| 🟢 NIEDRIG | F8 | Dead Code in claude-code.ts | Trivial |
| 🟢 NIEDRIG | F9 | `confine()` mit dynamischem cwd | Trivial |
| 🟢 NIEDRIG | F12 | Image Sanitizer nicht integriert | Mittel |
| 🟢 NIEDRIG | F16 | Conversation History unbegrenzt | Klein |
