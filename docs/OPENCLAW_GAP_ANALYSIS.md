# OpenClaw Gap Analysis — Was Geofrey noch fehlt

> Stand: 2026-02-14
> Quellen: https://openclaw.ai, https://github.com/openclaw/openclaw, OpenClaw Docs

## Legende

- ✅ = Geofrey hat es bereits
- ⚠️ = Geofrey hat es teilweise
- ❌ = Fehlt komplett

---

## 1. UI & Client-Anwendungen

| Feature | OpenClaw | Geofrey | Status |
|---------|----------|---------|--------|
| Web-Dashboard (Control UI) | Session-Management, Agent-Config, Health-Monitoring, Debug-Tools, Log-Viewer | ✅ SSE streaming, audit log viewer, Bearer auth | ✅ |
| WebChat (Browser-Chat) | Markdown-Rendering, Auto-Scroll, Typing-Indicators, Debug-Tools | ✅ Markdown rendering, dark theme, approval buttons | ✅ |
| Live Canvas (A2UI) | Agent-gesteuerter visueller Workspace, push/reset/eval/snapshot | — | ❌ |
| macOS Companion App | Menubar, Voice Wake ("Hey Claw"), Push-to-Talk, Remote Gateway | ✅ WebSocket + APNS push | ✅ |
| iOS Companion App | Live Canvas, Voice Wake, Camera, Screen Recording, Bonjour, Location | ✅ WebSocket + APNS push | ✅ |
| Android Companion App | Live Canvas, Talk Mode, Camera, Screen Recording, SMS | ✅ WebSocket + FCM push | ✅ |
| CLI Chat-Befehle | `/status`, `/new`, `/reset`, `/compact`, `/think`, `/verbose`, `/usage`, `/restart` | Nur `pnpm setup` | ⚠️ |

**Priorität:** Web-Dashboard + WebChat sind das Minimum für Desktop-Nutzung.

---

## 2. Messaging-Plattformen

| Plattform | OpenClaw | Geofrey | Status |
|-----------|----------|---------|--------|
| Telegram | ✅ grammY | ✅ grammY | ✅ |
| WhatsApp | ✅ Baileys (unofficial) | ✅ Cloud API (official) | ✅ |
| Signal | ✅ signal-cli | ✅ signal-cli | ✅ |
| Slack | ✅ Bolt SDK | ✅ @slack/bolt (Socket Mode, Block Kit) | ✅ |
| Discord | ✅ discord.js | ✅ discord.js (Gateway Intents, Buttons) | ✅ |
| Google Chat | ✅ Google Chat API | — | ❌ |
| Microsoft Teams | ✅ Teams API | — | ❌ |
| Matrix | ✅ Matrix Protocol | — | ❌ |
| BlueBubbles (iMessage) | ✅ BlueBubbles API | — | ❌ |
| iMessage (legacy) | ✅ Direct | — | ❌ |
| Zalo | ✅ Zalo API | — | ❌ |
| Zalo Personal | ✅ Zalo Personal API | — | ❌ |
| WebChat (built-in) | ✅ Gateway-integriert | ✅ SSE + REST, Bearer auth, dark theme | ✅ |
| Typing Indicators | ✅ Konfigurierbares Intervall | Nur Telegram (rudimentär) | ⚠️ |
| Presence Indicators | ✅ Online-Status | — | ❌ |
| Gruppen-Isolation | ✅ Activation Modes (mention/always) | — (Owner-only) | ❌ |
| DM Pairing Codes | ✅ Unbekannte Sender blockiert | Owner-only Filter | ⚠️ |
| Channel Allowlisting | ✅ Per Agent | — | ❌ |

**Status:** Alle Kern-Plattformen implementiert. Nur Nischen-Plattformen (Google Chat, Teams, Matrix, iMessage) fehlen noch.

---

## 3. Tools & Fähigkeiten

| Tool | OpenClaw | Geofrey | Status |
|------|----------|---------|--------|
| Shell/Exec | ✅ | ✅ shell.ts | ✅ |
| Filesystem (read/write) | ✅ | ✅ filesystem.ts | ✅ |
| Local-Ops (20 native Tools) | — | ✅ mkdir, copy, move, find, tree, diff, sort, head/tail, base64, archive, system info (0 Cloud-Tokens) | ✅ |
| Git | ✅ | ✅ git.ts | ✅ |
| Content Search | ✅ | ✅ search.ts | ✅ |
| Claude Code | — (eigenes Modell) | ✅ claude-code.ts | ✅ |
| MCP Client | ⚠️ Community-Lösungen | ✅ Nativ | ✅ |
| Browser-Automation (CDP) | ✅ Chrome DevTools Protocol, Snapshots | ✅ CDP via chrome-remote-interface, accessibility tree, 9 actions | ✅ |
| Web Search | ✅ Keyword-Suche | ✅ SearXNG + Brave Search | ✅ |
| Web Fetch | ✅ Seiten lesen/downloaden | ✅ HTML→Markdown converter | ✅ |
| Image Understanding | ✅ | ✅ image-handler.ts (OCR + Beschreibung) | ✅ |
| Process Management | ✅ List, Check, Kill | ✅ process/manager.ts (spawn/list/check/kill/logs) | ✅ |
| Cron/Scheduler | ✅ At/Every/Cron-Expressions, persistent | ✅ 5-field cron, SQLite-backed, exponential retry | ✅ |
| Webhooks | ✅ HTTP-Endpoint-Triggers | ✅ HTTP server, HMAC auth, rate limiting, GitHub/Stripe/generic templates | ✅ |
| Gmail Integration | ✅ Pub/Sub, Echtzeit | ✅ Google OAuth2 + Gmail API | ✅ |
| Notifications | ✅ Push an paired Devices | ✅ APNS + FCM push | ✅ |
| Upload | ✅ Web-Upload | — | ❌ |
| Camera/Location/Screen | ✅ Via paired Devices | — | ❌ |
| Discord/Slack Actions | ✅ Native Plattform-Automation | — | ❌ |

**Status:** Alle Kern-Tools implementiert. Nur Upload, Camera/Location/Screen und native Discord/Slack Actions fehlen noch.

---

## 4. Skills & Erweiterbarkeit

| Feature | OpenClaw | Geofrey | Status |
|---------|----------|---------|--------|
| Skill-Marketplace (ClawHub) | ✅ 700+ Community-Skills, clawhub.ai | ✅ Curated repository, SHA-256 verification, 5 templates | ✅ |
| Skill-Format (SKILL.md) | ✅ YAML-Frontmatter + Plain English | ✅ YAML frontmatter (Zod), global + local dirs | ✅ |
| Skill-Auto-Generation | ✅ Agent erstellt Skills autonom | ✅ generate action via skill tool | ✅ |
| Skill-Permissions-Manifest | ✅ filesystem, network, env, exec Scoping | ✅ 4-axis permissions (filesystem/network/env/exec) | ✅ |
| Smart Home (Hue, Elgato, HomeAssistant) | ✅ | ✅ Hue API v2, HomeAssistant REST, Sonos HTTP | ✅ |
| Productivity (Notes, Reminders, Notion) | ✅ | — | ❌ |
| Musik (Spotify, Sonos) | ✅ | ✅ Sonos HTTP API (playback, volume, groups) | ⚠️ |
| Media Generation (fal.ai, Replicate) | ✅ | — | ❌ |

**Status:** Skill-System komplett (Format, Registry, Marketplace, Permissions, Auto-Generation, Templates). Nur Productivity-Tools und Media-Generation fehlen.

---

## 5. Voice & Audio

| Feature | OpenClaw | Geofrey | Status |
|---------|----------|---------|--------|
| Speech-to-Text (Whisper) | ✅ | ✅ OpenAI Whisper API + local whisper.cpp | ✅ |
| Text-to-Speech (ElevenLabs) | ✅ Custom Voice Cloning, 32+ Sprachen | ✅ ElevenLabs multilingual_v2, LRU cache, text splitting | ✅ |
| Voice Wake ("Hey Claw") | ✅ macOS, iOS, Android | — | ❌ |
| Talk Mode (kontinuierlich) | ✅ | — | ❌ |
| Push-to-Talk | ✅ macOS Overlay | — | ❌ |
| Telefon-Integration | ✅ ElevenLabs Agents | — | ❌ |
| Voice Messages (WhatsApp etc.) | ✅ Transkription | ✅ Alle Plattformen (Telegram/WhatsApp/Signal) | ✅ |

**Status:** STT + TTS + Voice Messages komplett. Nur Voice Wake, Talk Mode, Push-to-Talk und Telefon-Integration fehlen.

---

## 6. Memory & Wissensmanagement

| Feature | OpenClaw | Geofrey | Status |
|---------|----------|---------|--------|
| Conversation Persistence | ✅ Sessions | ✅ SQLite + Drizzle | ✅ |
| Persistent Memory (MEMORY.md) | ✅ Entscheidungen, Präferenzen, Fakten | ✅ MEMORY.md + Ollama embeddings | ✅ |
| Daily Notes (memory/YYYY-MM-DD.md) | ✅ Laufender Kontext | ✅ Daily notes support | ✅ |
| Semantic Memory Search | ✅ Vektor-Index, ~400 Token Chunks | ✅ Cosine similarity, ~400 token chunks | ✅ |
| Auto-Recall | ✅ Automatisch relevante Erinnerungen laden | ✅ Threshold 0.7, top-K results | ✅ |
| Session Compaction | ✅ Ältere Konversation zusammenfassen | ✅ Ollama summarization, /compact command | ✅ |
| Pre-Compaction Memory Flush | ✅ Vor Kompaktierung wichtiges speichern | ✅ flushToMemory() extracts key facts | ✅ |
| Session Pruning | ✅ In-Memory Trimming alter Tool-Ergebnisse | ✅ pruneToolResults() + pruneOldMessages() | ✅ |
| Context Window Management | ✅ Per-Model Tracking, Auto-Overflow | ✅ Token counting, auto-compact at 75% | ✅ |

**Status:** Vollständige Feature-Parität mit OpenClaw bei Memory & Wissensmanagement.

---

## 7. Multi-Agent & Kollaboration

| Feature | OpenClaw | Geofrey | Status |
|---------|----------|---------|--------|
| Multi-Agent Routing | ✅ Hub-and-Spoke, Bindings | ✅ Hub-and-Spoke, 3 routing strategies | ✅ |
| Agent-to-Agent Communication | ✅ sessions_list/history/send | ✅ Inter-agent message passing | ✅ |
| Workspace Isolation per Agent | ✅ | ✅ Per-agent session namespacing | ✅ |
| Per-Agent Model Config | ✅ | ✅ AgentConfig with model field | ✅ |
| Per-Agent Tool Access | ✅ | ✅ Per-agent tool scoping | ✅ |
| A2A Protocol (experimental) | ⚠️ Community | — | ❌ |

**Status:** Vollständige Feature-Parität mit OpenClaw bei Multi-Agent Routing. Nur A2A Protocol fehlt.

---

## 8. Multi-Model Support

| Feature | OpenClaw | Geofrey | Status |
|---------|----------|---------|--------|
| Anthropic (Claude) | ✅ OAuth + API Key | ✅ Via Claude Code | ✅ |
| Ollama (lokal) | ✅ | ✅ Orchestrator | ✅ |
| OpenAI (GPT-4o, o1, o3) | ✅ | — | ❌ |
| Google (Gemini 3 Pro) | ✅ | — | ❌ |
| DeepSeek | ✅ | — | ❌ |
| LM Studio | ✅ | — | ❌ |
| OpenRouter (100+ Modelle) | ✅ | — | ❌ Bewusst nicht implementiert — widerspricht Local-First-Philosophie |
| Model Failover | ✅ Auth Profile Rotation | — | ❌ |
| Per-Task Model Routing | ✅ | — | ❌ |
| Extended Thinking (Levels) | ✅ off/minimal/low/medium/high/xhigh | — | ❌ |

**Status:** Geofrey nutzt bewusst einen lokalen Ollama-Orchestrator statt Cloud-API-Gateways. Multi-Model über Cloud-Dienste widerspricht dem Kernprinzip der lokalen, kostengünstigen Inferenz.

---

## 9. Deployment & Infrastruktur

| Feature | OpenClaw | Geofrey | Status |
|---------|----------|---------|--------|
| Docker | ✅ | ✅ | ✅ |
| Docker Compose | ✅ | ✅ (mit Ollama + GPU) | ✅ |
| systemd | ✅ --install-daemon | ✅ Dokumentiert | ✅ |
| launchd (macOS) | ✅ --install-daemon | — | ❌ |
| PM2 | ✅ | ✅ Dokumentiert | ✅ |
| Tailscale Serve/Funnel | ✅ | — | ❌ |
| Ansible Automation | ✅ openclaw-ansible | — | ❌ |
| Pulumi (AWS/Hetzner) | ✅ | — | ❌ |
| DigitalOcean 1-Click | ✅ | — | ❌ |
| Nix Package Manager | ✅ | — | ❌ |
| Release Channels (stable/beta/dev) | ✅ | — (keine Releases) | ❌ |
| `doctor` Diagnostik-Tool | ✅ Config-Validation, Auto-Repair | — | ❌ |

**Priorität:** `doctor`-Diagnostik und launchd sind nice-to-have. Deployment ist bereits solide.

---

## 10. Sicherheit

| Feature | OpenClaw | Geofrey | Status |
|---------|----------|---------|--------|
| 4-Tier Risk Classification | ✅ | ✅ L0-L3 | ✅ |
| Hybrid Classification (Regex + LLM) | ✅ | ✅ | ✅ |
| Approval System | ✅ Ask before executing | ✅ Promise-based Blocking Gate | ✅ |
| Command Decomposition | ✅ Compound checking | ✅ Shlex-style | ✅ |
| Prompt Injection Defense | — (nicht dokumentiert) | ✅ 3-Layer (User/Tool/Model) | ✅ |
| MCP Output Sanitization | — (nicht dokumentiert) | ✅ DATA Boundary Tags | ✅ |
| MCP Server Allowlist | — (nicht dokumentiert) | ✅ | ✅ |
| MCP Response Validation (Zod) | — (nicht dokumentiert) | ✅ | ✅ |
| Image Metadata Sanitization | — (nicht dokumentiert) | ✅ EXIF/XMP/IPTC + Injection Scan | ✅ |
| Filesystem Confinement | — (nicht dokumentiert) | ✅ confine() | ✅ |
| Docker Sandbox (per Session) | ✅ Isolierte Container | ✅ Container lifecycle, session pool, volume mounting | ✅ |
| Safe Binaries Allowlist | ✅ | — (über L0-Patterns) | ⚠️ |
| Tool Policies (Allow/Deny per Agent) | ✅ | — (global Risk Levels) | ❌ |
| Skill Permission Manifest | ✅ Risk Scoring (5 Levels) | ✅ 4-axis permissions (filesystem/network/env/exec) | ✅ |
| VirusTotal Skill Scanning | ✅ | — | ❌ |
| DM Pairing Codes | ✅ | — (Owner-only) | ⚠️ |
| Gateway Auth (Password/OAuth) | ✅ | — (kein Gateway) | ❌ |

**Status:** Docker Sandbox implementiert. Geofrey ist bei Sicherheit insgesamt stärker als OpenClaw (Prompt Injection, MCP Security, Image Sanitization, Filesystem Confinement).

---

## 11. Kosten & Monitoring

| Feature | OpenClaw | Geofrey | Status |
|---------|----------|---------|--------|
| Per-Response Kosten-Tracking | ✅ | ✅ Per-request logging + daily aggregates + per-request cost display | ✅ |
| Per-Request Cost Display | — | ✅ `[Cloud: X Tokens (€Y) \| Lokal: Z Tokens (€0,00)]` | ✅ |
| `/usage` Befehle (off/tokens/full) | ✅ | — | ❌ |
| Budget-Limits & Alerts | ✅ ClawWatcher (50/75/90%) | ✅ MAX_DAILY_BUDGET_USD (50/75/90% alerts) | ✅ |
| Token-Metriken | ✅ | ✅ Input/output tokens per request | ✅ |
| Monitoring Dashboard | ✅ ClawWatcher (3rd Party) | — | ❌ |

**Status:** Kosten-Tracking und Budget-Limits komplett. Nur Monitoring Dashboard und `/usage` Befehle fehlen.

---

## Zusammenfassung: Top-Prioritäten

### Phase 1 — Essentials (v1.1)
1. **Web-Dashboard + WebChat** — Desktop-Nutzung ohne Telegram
2. **Persistent Memory** — MEMORY.md + Semantic Search (Agent braucht Langzeitgedächtnis)
3. **Web Search + Web Fetch Tools** — Grundlegende Internet-Fähigkeiten
4. **Cron/Scheduler** — Proaktive Aufgaben ohne manuellen Trigger
5. **Kosten-Tracking** — Per-Request Token/Cost Logging

### Phase 2 — Power Features (v1.2)
6. **Browser-Automation (CDP)** — Websites steuern, Formulare ausfüllen
7. **Skill-System** — SKILL.md Format + Registry (Erweiterbarkeit)
8. **Slack + Discord Adapter** — Wichtigste fehlende Plattformen
9. **Voice Messages (STT/Whisper)** — WhatsApp/Telegram Sprachnachrichten
10. **Session Compaction** — Intelligentes Context-Window-Management

### Phase 3 — Differenzierung (v1.3)
11. **Docker Sandbox per Session** — Isolierte Tool-Ausführung
12. **Webhook-Triggers** — Externe Events als Auslöser
14. **Process Management Tool** — Hintergrund-Prozesse verwalten
15. **TTS (ElevenLabs)** — Sprachantworten

### Phase 4 — Ecosystem (v2.0) ✅
16. ~~**Multi-Agent Routing** — Mehrere Agenten mit unterschiedlichen Rollen~~
17. ~~**Skill-Marketplace** — Community-Skills~~
18. ~~**Companion Apps** (macOS/iOS/Android)~~
19. ~~**Smart Home Integration**~~
20. ~~**Gmail/Calendar Automation**~~

---

## Wo Geofrey BESSER ist als OpenClaw

1. **Prompt Injection Defense** — 3-Layer-System (User/Tool/Model), OpenClaw hat nichts Vergleichbares dokumentiert
2. **MCP Native Support** — OpenClaw hat nur Community-Workarounds, Geofrey hat nativen MCP Client
3. **MCP Security** — Output Sanitization, Server Allowlist, Zod Validation — alles fehlt bei OpenClaw
4. **Image Metadata Sanitization** — EXIF/XMP/IPTC Stripping + Injection Scanning
5. **Local-First Orchestrator** — Qwen3 8B als Sicherheitsschicht, OpenClaw sendet alles direkt an Cloud-APIs
6. **Hybrid Risk Classification** — Deterministic (90%) + LLM (10%), kein Single Point of Failure
7. **Claude Code Integration** — Dedizierter Coding-Agent mit Session-Management und Streaming
8. **Kosten** — Lokaler Orchestrator + 20 Local-Ops spart 80-90% der API-Kosten vs. OpenClaw ($5-200/mo vs. $200-600/mo)
9. **Local-Ops** — 20 native Node.js-Tools für einfache OS-Operationen (mkdir, copy, find, diff, sort, archive) — 0 Cloud-Tokens, sofortige Ausführung
10. **Per-Request Cost Display** — Jede Antwort zeigt Cloud- vs. Lokal-Tokenverbrauch mit Kosten
11. **Filesystem Confinement** — `confine()` verhindert Path Traversal, OpenClaw hat das nicht
12. **Obfuscation-resistant Blocking** — L3-Patterns erkennen Pfad-Varianten, Base64, chmod+x Chains
