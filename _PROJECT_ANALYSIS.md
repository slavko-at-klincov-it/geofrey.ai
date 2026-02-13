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
onImageMessage(chatId, image) → processImage() → runAgentLoopStreaming(config, chatId, description, platform)
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

**Exports:** `runAgentLoopStreaming()`

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
| `tools/claude-code` | `ClaudeResult` (type), `getAndClearLastResult`, `setStreamCallbacks`, `clearStreamCallbacks` |

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
- Claude Code Enrichment: `getAndClearLastResult()` für Session/Cost/Tokens

#### `lastInvokeResult` + `getAndClearLastResult()` (Modul-Level)
- **Zweck:** Speichert letztes Claude Code Ergebnis für Audit-Enrichment
- ✅ `agent-loop.ts` liest via `getAndClearLastResult()` im `onStepFinish` Hook

### `src/orchestrator/conversation.ts`

**Exports:** `setDbUrl`, `getOrCreate`, `addMessage`, `getHistory`

**State:** Dual-Persistence (In-Memory Map + SQLite)
- Reads: Memory-first, DB-Fallback
- Writes: Beide gleichzeitig

✅ Dead Exports (`setClaudeSession`, `getClaudeSession`, `clearConversation`) entfernt — siehe [F2](#f2)

### `src/orchestrator/prompt-generator.ts`

**Exports:** `generatePrompt`, `scopeToolsForRisk`, `buildClaudeCodePrompt`

8 Task-Templates: bug_fix, refactor, new_feature, code_review, test_writing, debugging, documentation, freeform

✅ Tool-Scoping verdrahtet: `claude_code` defaultet `allowedTools` auf `toolProfiles.standard` — siehe [F3](#f3)

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
- ✅ Timeout-Support: optionaler `timeoutMs` Parameter, auto-reject nach Ablauf — siehe [F4](#f4)

### ~~`src/approval/execution-guard.ts`~~ — GELÖSCHT
✅ Logik war bereits in `prepareStep` und `tool-registry.ts` inline — siehe [F5](#f5)

### ~~`src/approval/action-registry.ts`~~ — GELÖSCHT
✅ War durch Regex-Patterns in `risk-classifier.ts` ersetzt — siehe [F6](#f6)

---

## 4. Tools

### `src/tools/tool-registry.ts`

**Exports:** `ToolDefinition` (interface), `registerTool`, `getTool`, `getAllTools`, `getToolSchemas`, `getAiSdkTools`

**Registrierungsmuster:** Module rufen `registerTool()` bei Import-Time auf → `index.ts` importiert alle Tool-Module als Side-Effects.

**`getAiSdkTools()`** — Konvertiert alle registrierten Tools zu Vercel AI SDK Format:
- `needsApproval` Hook: `classifyDeterministic()` → `true` für L2/L3 oder unbekannt
- `execute` Wrapper: L3-Block, `trackInflight()`, Error-Handling

**Hinweis:** `getTool`, `getAllTools`, `getToolSchemas` sind bewusst beibehalten als Public API — siehe [F7](#f7)

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

✅ Dead Code (`TextDecoderStream`, `readable`) entfernt — siehe [F8](#f8)

### `src/tools/filesystem.ts`

4 Tools: `read_file` (L0), `write_file` (L1), `delete_file` (L2), `list_dir` (L0)

**Security:** `confine(path)` → `resolve()` + `startsWith(PROJECT_ROOT)` gegen Path Traversal

✅ `PROJECT_ROOT` wird einmalig bei Modul-Load erfasst (statisch) — siehe [F9](#f9)

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

✅ `setAllowedServers()` wird in `index.ts` vor MCP-Verbindungen aufgerufen — siehe [F10](#f10)

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
  onImageMessage(chatId, image: ImageAttachment): Promise<void>;
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

✅ Claude Code Streaming via `setStreamCallbacks()` / `clearStreamCallbacks()` in Agent-Loop integriert — siehe [F11](#f11)

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

✅ Integriert in Messaging-Pipeline via `image-handler.ts` — Adapter downloaden Bilder → Sanitize → OCR → Store → Text-Beschreibung an Orchestrator — siehe [F12](#f12)

---

## 7. Audit

### `src/audit/audit-log.ts`

**Exports:** `AuditEntry`, `appendAuditEntry`, `verifyChain`

**Hash-Chain:**
- `lastHash` beginnt bei `"GENESIS"` (Modul-Level)
- Jeder Eintrag: `prevHash = lastHash`, `hash = SHA-256(entry + prevHash)`
- JSONL-Dateien pro Tag: `{logDir}/{YYYY-MM-DD}.jsonl`

**AuditEntry Felder:** timestamp, action, toolName, toolArgs, riskLevel, approved, result, userId, claudeSessionId?, claudeModel?, costUsd?, tokensUsed?, allowedTools?

✅ Hash-Chain wird bei Neustart via `initLastHash()` wiederhergestellt — siehe [F13](#f13)
✅ Audit-Einträge für L3-Blocks (`tool_blocked`) und User-Denials (`tool_denied`) — siehe [F14](#f14)

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

**Hinweis:** `pendingApprovals` Tabelle ist Platzhalter für zukünftige DB-Persistenz (TODO-Kommentar) — siehe [F15](#f15)

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
| `claude-code.ts` | `lastInvokeResult` (single ClaudeResult) | Modul | Memory only |
| `claude-code.ts` | `activeStreamCallbacks` | Modul | Memory only |
| `agent-loop.ts` | `consecutiveErrors` Map\<chatId, number\> | Modul | Memory only |
| `mcp-client.ts` | `activeConnections` Map\<name, Connection\> | Modul | Memory only |
| `tool-registry.ts` | `tools` Map\<name, ToolDefinition\> | Modul | Memory only |
| `index.ts` | `inFlightCount` | Modul | Memory only |
| `audit-log.ts` | `lastHash` | Modul | Memory only |
| `db/client.ts` | `db`, `sqlite` Singleton | Modul | SQLite (WAL) |
| `i18n/index.ts` | `currentLocale` | Modul | Memory only |

---

## 15. FEHLER & LÜCKEN

> **Stand:** 17 von 17 Problemen behoben. Nur F7 bleibt bewusst offen (nützliche Public API).

### A. Fehlende Brücken / Nicht-verdrahtete Logik

<a id="f1"></a>
#### F1: `lastClaudeResult` wird nie befüllt ~~(KRITISCH)~~ ✅ GEFIXT
**Lösung:** `lastInvokeResult` wird in `claude-code.ts` nach jeder Invocation gesetzt. `agent-loop.ts` liest via `getAndClearLastResult()` im `onStepFinish` Hook. Audit-Einträge enthalten jetzt `claudeSessionId`, `claudeModel`, `costUsd`, `tokensUsed`.

<a id="f3"></a>
#### F3: `prompt-generator.ts` — Tool-Scoping nicht verdrahtet ~~(MITTEL)~~ ✅ GEFIXT
**Lösung:** `claude_code` Tool defaultet `allowedTools` auf `claudeConfig.toolProfiles.standard` wenn der Orchestrator keinen Wert übergibt. Die Template-Funktionen (`generatePrompt`, `buildClaudeCodePrompt`) bleiben als API verfügbar, werden aber nicht inline erzwungen — der Orchestrator (Qwen3 8B) formuliert Prompts selbst via System-Prompt-Anweisungen.

<a id="f4"></a>
#### F4: Kein Timeout auf Approval-Promises ~~(KRITISCH)~~ ✅ GEFIXT
**Lösung:** `createApproval()` akzeptiert optionalen `timeoutMs` Parameter. `agent-loop.ts` übergibt `config.limits.approvalTimeoutMs` (default 5 min). Nach Timeout wird die Promise mit `false` resolved, Eintrag aus Map entfernt, Timer bei manueller Resolution gecleert.

<a id="f10"></a>
#### F10: MCP Server Allowlist nie angewendet ~~(MITTEL)~~ ✅ GEFIXT
**Lösung:** `index.ts` ruft `setAllowedServers(config.mcp.allowedServers)` vor den MCP-Verbindungen auf.

<a id="f11"></a>
#### F11: Claude Code Streaming nicht integriert ~~(MITTEL)~~ ✅ GEFIXT
**Lösung:** `claude-code.ts` exportiert `setStreamCallbacks()` / `clearStreamCallbacks()`. `agent-loop.ts` setzt vor `streamText()` die Callbacks (`onText` → `stream.append()`, `onToolUse` → `> toolName...`), cleared im `finally`-Block. User sehen jetzt Live-Updates während Claude Code arbeitet.

<a id="f12"></a>
#### F12: Image Sanitizer nicht integriert ~~(NIEDRIG)~~ ✅ GEFIXT
**Lösung:** `image-handler.ts` implementiert die Pipeline: Adapter download → `sanitizeImage()` → OCR via `tesseract.js` → Store in `data/images/` → Text-Beschreibung an Orchestrator. Alle drei Adapter (Telegram, WhatsApp, Signal) unterstützen jetzt Bild-Upload. `onImageMessage` Callback in `index.ts` verdrahtet.

### B. Dead Code / Ungenutzte Module

<a id="f2"></a>
#### F2: Ungenutzte Exports in conversation.ts ✅ GEFIXT
**Lösung:** `setClaudeSession()`, `getClaudeSession()`, `clearConversation()` und `claudeSessionId` Feld entfernt. Tests angepasst.

<a id="f5"></a>
#### F5: execution-guard.ts komplett ungenutzt ✅ GEFIXT
**Lösung:** `execution-guard.ts` und `execution-guard.test.ts` gelöscht. Die Logik war bereits in `prepareStep` und `tool-registry.ts` inline implementiert.

<a id="f6"></a>
#### F6: action-registry.ts komplett ungenutzt ✅ GEFIXT
**Lösung:** `action-registry.ts` gelöscht. War durch Regex-Patterns in `risk-classifier.ts` ersetzt.

<a id="f7"></a>
#### F7: Ungenutzte Registry-Exports — OFFEN (bewusst)
**Datei:** `src/tools/tool-registry.ts`
**Funktionen:** `getTool()`, `getAllTools()`, `getToolSchemas()`
**Status:** Bewusst beibehalten als nützliche Public API für zukünftige Features (z.B. Tool-Discovery-Endpoint, CLI-Introspection).

<a id="f8"></a>
#### F8: Dead Code in claude-code.ts ✅ GEFIXT
**Lösung:** Unbenutzte `TextDecoderStream` und `readable` Variablen entfernt.

#### Nicht-streaming Agent Loop ✅ GEFIXT
**Lösung:** `runAgentLoop()` (non-streaming) entfernt. Nur `runAgentLoopStreaming()` bleibt.

### C. Logische Probleme

<a id="f9"></a>
#### F9: `confine()` nutzt dynamischen `process.cwd()` ✅ GEFIXT
**Lösung:** `const PROJECT_ROOT = process.cwd()` wird einmalig bei Modul-Load erfasst und in `confine()` verwendet.

<a id="f13"></a>
#### F13: Audit Hash-Chain bricht bei Neustart ✅ GEFIXT
**Lösung:** `initLastHash(logDir)` liest beim Start die letzte JSONL-Datei und setzt `lastHash` auf den letzten Hash. Wird in `index.ts` nach `mkdir("data/audit")` aufgerufen.

<a id="f14"></a>
#### F14: Keine Audit-Einträge für abgelehnte Actions ✅ GEFIXT
**Lösung:** `buildPrepareStep()` loggt jetzt `action: "tool_blocked"` für L3-Blocks und `action: "tool_denied"` für User-Denials mit `approved: false`.

<a id="f15"></a>
#### F15: `pendingApprovals` DB-Tabelle ungenutzt ✅ DOKUMENTIERT
**Lösung:** TODO-Kommentar in `schema.ts` hinzugefügt. Tabelle bleibt als Platzhalter für zukünftige DB-Persistenz von Approvals.

#### F16: Conversation History wächst unbegrenzt ✅ GEFIXT
**Lösung:** `agent-loop.ts` begrenzt die an Ollama übergebene History auf die letzten `MAX_HISTORY_MESSAGES` (50) Messages via `history.slice(-50)`.

#### F17: `maxConsecutiveErrors` nie implementiert ✅ GEFIXT
**Lösung:** `consecutiveErrors` Map in `agent-loop.ts` zählt Fehler pro Chat. Nach `config.limits.maxConsecutiveErrors` (default 3) aufeinanderfolgenden Fehlern wird eine Warnung ausgegeben und der Counter zurückgesetzt. Neuer i18n-Key `orchestrator.tooManyErrors` in DE + EN.

### D. Zusammenfassung

| Status | # | Problem |
|--------|---|---------|
| ✅ GEFIXT | F1 | `lastClaudeResult` — jetzt via `getAndClearLastResult()` |
| ✅ GEFIXT | F4 | Approval-Timeout — `createApproval(…, timeoutMs)` |
| ✅ GEFIXT | F3 | Tool-Scoping — default `allowedTools` aus Config |
| ✅ GEFIXT | F10 | MCP Allowlist — `setAllowedServers()` in `index.ts` |
| ✅ GEFIXT | F11 | Claude Code Streaming — `setStreamCallbacks()` in Agent-Loop |
| ✅ GEFIXT | F13 | Audit Hash-Chain — `initLastHash()` beim Start |
| ✅ GEFIXT | F14 | Audit für Denials — `tool_blocked` + `tool_denied` Einträge |
| ✅ DOKUMENTIERT | F15 | `pendingApprovals` Tabelle — TODO-Kommentar |
| ✅ GEFIXT | F17 | Consecutive Errors — Counter + `tooManyErrors` Message |
| ✅ GEFIXT | F2 | Dead Conversation-Exports — entfernt |
| ✅ GEFIXT | F5 | execution-guard.ts — gelöscht |
| ✅ GEFIXT | F6 | action-registry.ts — gelöscht |
| OFFEN | F7 | Registry-Exports — bewusst beibehalten (Public API) |
| ✅ GEFIXT | F8 | Dead Code claude-code.ts — entfernt |
| ✅ GEFIXT | F9 | `confine()` — statischer `PROJECT_ROOT` |
| ✅ GEFIXT | F12 | Image Sanitizer — `image-handler.ts` + Adapter-Integration |
| ✅ GEFIXT | F16 | History-Limit — max 50 Messages an LLM |
