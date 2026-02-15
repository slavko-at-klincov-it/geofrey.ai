# Feature Comparison: OpenClaw vs geofrey

> Stand: 2026-02-15 — wird bei neuen Features aktualisiert

| # | Kategorie | Feature | OpenClaw (59) | geofrey (64) |
|---|-----------|---------|:---:|:---:|
| | **UI & Client** | | **(5)** | **(3)** |
| 1 | | Web-Dashboard | ✅ | ✅ |
| 2 | | WebChat | ✅ | ✅ |
| 3 | | Live Canvas (A2UI) | ✅ | ❌ |
| 4 | | Companion Apps (macOS/iOS/Android) | ✅ | ✅ |
| 5 | | CLI Commands (/status, /compact, etc.) | ✅ | ❌ |
| | **Messaging** | | **(9)** | **(6)** |
| 6 | | Telegram | ✅ | ✅ |
| 7 | | WhatsApp | ⚠️ Baileys (Ban-Risiko) | ✅ Cloud API (offiziell) |
| 8 | | Signal | ✅ | ✅ |
| 9 | | Slack | ✅ | ✅ |
| 10 | | Discord | ✅ | ✅ |
| 11 | | WebChat (built-in) | ✅ | ✅ |
| 12 | | Google Chat | ✅ | ❌ |
| 13 | | Microsoft Teams | ✅ | ❌ |
| 14 | | Matrix | ✅ | ❌ |
| 15 | | iMessage | ✅ | ❌ |
| | **Tools** | | **(14)** | **(18)** |
| 16 | | Shell/Exec | ✅ | ✅ |
| 17 | | Filesystem (CRUD) | ✅ | ✅ |
| 18 | | Local-Ops (20 native Tools) | ❌ | ✅ |
| 19 | | Git | ✅ | ✅ |
| 20 | | Content Search | ✅ | ✅ |
| 21 | | Claude Code Integration | ❌ | ✅ |
| 22 | | MCP Client (native) | ⚠️ Community | ✅ |
| 23 | | Browser Automation (CDP) | ✅ | ✅ |
| 24 | | Web Search | ✅ | ✅ |
| 25 | | Web Fetch | ✅ | ✅ |
| 26 | | Image Understanding | ✅ | ✅ |
| 27 | | Process Management | ✅ | ✅ |
| 28 | | Cron/Scheduler | ✅ | ✅ |
| 29 | | Webhooks | ✅ | ✅ |
| 30 | | Gmail | ✅ | ✅ |
| 31 | | Calendar | ✅ | ✅ |
| 32 | | Push Notifications | ✅ | ✅ |
| 33 | | Auto-Tooling (Self-Extension) | ❌ | ✅ |
| | **Skills & Extensions** | | **(5)** | **(5)** |
| 34 | | Skill Marketplace | ✅ | ✅ |
| 35 | | Skill Format (SKILL.md) | ✅ | ✅ |
| 36 | | Skill Auto-Generation | ✅ | ✅ |
| 37 | | Skill Permissions | ✅ | ✅ |
| 38 | | Smart Home (Hue/HA/Sonos) | ✅ | ✅ |
| | **Voice & Audio** | | **(5)** | **(2)** |
| 39 | | STT (Whisper) | ✅ | ✅ |
| 40 | | TTS | ✅ | ❌ (local-only wenn nötig) |
| 41 | | Voice Wake Word | ✅ | ❌ |
| 42 | | Talk Mode | ✅ | ❌ |
| 43 | | Voice Messages | ✅ | ✅ |
| | **Memory** | | **(6)** | **(8)** |
| 44 | | Conversation Persistence | ✅ | ✅ |
| 45 | | Persistent Memory | ✅ | ✅ |
| 46 | | Semantic Search | ✅ | ✅ |
| 47 | | Auto-Recall | ✅ | ✅ |
| 48 | | Structured Memory | ❌ | ✅ |
| 49 | | Decision Conflict Guard | ❌ | ✅ |
| 50 | | Session Compaction | ✅ | ✅ |
| 51 | | Context Window Management | ✅ | ✅ |
| | **Multi-Agent** | | **(4)** | **(4)** |
| 52 | | Hub-and-Spoke Routing | ✅ | ✅ |
| 53 | | Agent-to-Agent Communication | ✅ | ✅ |
| 54 | | Per-Agent Isolation | ✅ | ✅ |
| 55 | | Per-Agent Model/Tools | ✅ | ✅ |
| | **Security & Privacy** | | **(5)** | **(13)** |
| 56 | | Risk Classification (L0–L3) | ✅ | ✅ |
| 57 | | Hybrid Classification (Regex+LLM) | ✅ | ✅ |
| 58 | | Approval System | ✅ | ✅ |
| 59 | | Command Decomposition | ✅ | ✅ |
| 60 | | Prompt Injection Defense (3-Layer) | ❌ | ✅ |
| 61 | | MCP Security (sanitize/allowlist/validate) | ❌ | ✅ |
| 62 | | Image Metadata Sanitization | ❌ | ✅ |
| 63 | | Privacy Rules DB | ❌ | ✅ |
| 64 | | Image Privacy Classification (VL) | ❌ | ✅ |
| 65 | | Email Anonymization | ❌ | ✅ |
| 66 | | Output Credential Filter | ❌ | ✅ |
| 67 | | Filesystem Confinement | ❌ | ✅ |
| 68 | | Docker Sandbox | ✅ | ✅ |
| | **Cost & Monitoring** | | **(3)** | **(3)** |
| 69 | | Cost Tracking | ✅ | ✅ |
| 70 | | Budget Alerts | ✅ | ✅ |
| 71 | | Per-Request Cost Display | ❌ | ✅ |
| 72 | | Monitoring Dashboard | ✅ | ❌ |
| | **Deployment** | | **(4)** | **(2)** |
| 73 | | Docker/Compose | ✅ | ✅ |
| 74 | | systemd/PM2 | ✅ | ✅ |
| 75 | | launchd (macOS) | ✅ | ❌ |
| 76 | | Cloud (DO/AWS/Hetzner) | ✅ | ❌ |

## Wo geofrey stärker ist

- **Security & Privacy** (13 vs 5) — Privacy Layer, Anonymization, Image Classification, Output Filter, Prompt Injection Defense
- **Tools** (18 vs 14) — Local-Ops (20 native Tools), Claude Code Integration, Auto-Tooling, nativer MCP Client
- **Memory** (8 vs 6) — Structured Memory, Decision Conflict Guard

## Wo OpenClaw stärker ist

- **Messaging** (9 vs 6) — Google Chat, Teams, Matrix, iMessage
- **Voice** (5 vs 2) — TTS, Voice Wake, Talk Mode
- **Deployment** (4 vs 2) — launchd, Cloud-Provider Templates
- **UI** (5 vs 3) — Live Canvas, CLI Commands
