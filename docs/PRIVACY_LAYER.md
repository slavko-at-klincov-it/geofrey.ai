# Privacy Layer — geofrey.ai

## Principle

Nothing leaves the local machine unreviewed. Every piece of data — text, images, emails, files — passes through a privacy gate before reaching Claude Code or any cloud API. The local LLM orchestrator (Qwen3 8B) and deterministic rules decide what gets anonymized, summarized locally, or blocked entirely.

## Architecture

```
User Input (text, image, email, file)
        │
        ▼
┌─────────────────────────────────────────────────┐
│            DETERMINISTIC PRE-FILTER              │
│                                                  │
│  Regex patterns:                                 │
│  - API keys, tokens, passwords                   │
│  - Email addresses, phone numbers, IBANs         │
│  - IP addresses, connection strings              │
│  - Home paths (/Users/*, /home/*)                │
│  - Custom terms (user-defined)                   │
│                                                  │
│  Hard blocks (never forwarded, no override):     │
│  - Credentials (API keys, tokens, passwords)     │
│  - Biometric data (face photos, voice prints)    │
│                                                  │
│  Result: known PII → anonymized immediately      │
│          hard-blocked → stays local              │
│          unknown → next layer                    │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│            LLM CONTEXT ANALYSIS (Qwen3 8B)       │
│                                                  │
│  For ambiguous data the regex can't catch:       │
│  - Person names, company names                   │
│  - Project-internal identifiers                  │
│  - Context-dependent sensitivity                 │
│                                                  │
│  Default: AGGRESSIVE (opt-out)                   │
│  Everything suspicious → anonymize first,        │
│  user must explicitly whitelist                   │
│                                                  │
│  If unsure → ask user:                           │
│  "Ist 'Müller GmbH' personenbezogen?            │
│   Soll ich das anonymisieren?                    │
│   Gilt das nur für dieses Projekt oder global?"  │
│                                                  │
│  Answer → stored in Privacy Memory (never ask    │
│  again for the same data type)                   │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│            ANONYMIZED OUTPUT                     │
│                                                  │
│  "Herr __ANON_NAME_001__ von __ANON_ORG_001__   │
│   hat eine Email an __ANON_EMAIL_001__ gesendet" │
│                                                  │
│  → Safe to send to Claude Code                   │
│  → Claude Code works with placeholders           │
│  → Output de-anonymized before showing to user   │
└─────────────────────────────────────────────────┘
```

## Image Pipeline

Images are NOT forwarded to Claude Code by default. A local vision model classifies the image first.

```
User sends image
        │
        ▼
┌──────────────────────────────────────┐
│  1. EXIF/XMP/IPTC metadata stripped  │  (already implemented)
│  2. Injection patterns scanned       │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  3. Qwen3-VL-2B Classification      │
│     (on-demand: load → process →    │
│      unload from Ollama)            │
│                                      │
│     Categories:                      │
│     - screenshot    → OCR text ok    │
│     - document      → OCR text only  │
│     - photo_person  → BLOCKED        │
│     - photo_object  → describe only  │
│     - diagram/chart → describe only  │
└──────────────────┬───────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
     photo_person      everything else
          │                 │
          ▼                 ▼
     BLOCKED            Tesseract OCR
     (stays local,      + Qwen3 8B text
      never forwarded)  description
                           │
                           ▼
                   Anonymized text
                   → Claude Code
```

### Qwen3-VL-2B Lifecycle

The vision model is NOT kept in memory. It follows a strict load/process/unload cycle:

1. **Load**: `ollama pull qwen3-vl-2b` (first use only) + load into Ollama
2. **Process**: Classify the image (single inference, ~2-5s)
3. **Unload**: Immediately release from Ollama memory (`ollama stop qwen3-vl-2b` or API equivalent)

This keeps RAM usage at Qwen3 8B baseline (~5GB) except during the brief classification window.

## Email Pipeline

Email content is always anonymized before reaching Claude Code.

```
Gmail API → raw email content
        │
        ▼
┌──────────────────────────────────────┐
│  Deterministic: strip headers,       │
│  detect emails, IPs, phone numbers   │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  LLM pass: extract names,           │
│  company names, addresses            │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  Apply mapping table:                │
│  "Max Müller" → __ANON_NAME_001__   │
│  "max@firma.de" → __ANON_EMAIL_001__│
└──────────────────┬───────────────────┘
                   │
                   ▼
        Anonymized email text
        → Claude Code (if code task)
        → Qwen3 8B (if summarization)
```

## Hard Blocks (No Override)

These data types are NEVER forwarded to Claude Code, even if the user explicitly requests it:

| Data Type | Reason | What Happens Instead |
|-----------|--------|---------------------|
| Credentials (API keys, tokens, passwords) | Leak risk to cloud | Always replaced with `__ANON_SECRET_NNN__` |
| Biometric data (face photos, fingerprints) | Irreversible exposure | Image stays local, text description only |

## Default Behavior: Aggressive Opt-Out

When Geofrey encounters data it hasn't seen before:

1. **Known patterns** (regex) → anonymize silently
2. **Suspicious but unknown** → anonymize AND ask user:
   - "Soll ich `Müller GmbH` als personenbezogen behandeln?"
   - "Gilt das nur für dieses Projekt oder für alle Projekte?"
3. **User answers** → stored permanently, never asked again
4. **User can opt-out** → explicitly whitelist specific data via Privacy Rules

## Privacy Memory

Dual storage: SQLite for the AI (fast, searchable) + MD export for the user (readable, editable, versionable).

### SQLite Table: `privacy_rules`

```sql
CREATE TABLE privacy_rules (
  id          INTEGER PRIMARY KEY,
  value       TEXT NOT NULL,          -- the actual data or pattern
  category    TEXT NOT NULL,          -- 'name', 'email', 'org', 'custom', ...
  action      TEXT NOT NULL,          -- 'anonymize', 'block', 'allow'
  scope       TEXT NOT NULL,          -- 'global' or project path
  source      TEXT NOT NULL,          -- 'auto', 'user', 'llm'
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed   INTEGER NOT NULL DEFAULT 0  -- 1 = user confirmed
);
```

### MD Export: `PRIVACY_RULES.md` (global) + `.geofrey/privacy.md` (per project)

```markdown
# Privacy Rules

## Global (all projects)
- [anonymize] Max Müller → __ANON_NAME__ (source: user, confirmed)
- [anonymize] max@firma.de → __ANON_EMAIL__ (source: auto, confirmed)
- [block] Face photos → never forward (source: system, permanent)

## Project: ~/Code/my-app
- [anonymize] ACME_API_KEY=sk-... → __ANON_SECRET__ (source: auto, confirmed)
- [allow] project-name "my-app" → not sensitive (source: user, confirmed)
```

### Rule Lifecycle

```
New data detected
       │
       ▼
  Known pattern? ──yes──→ Auto-anonymize (source: auto)
       │
       no
       │
       ▼
  LLM suspects PII? ──yes──→ Anonymize + ask user
       │                          │
       no                         ▼
       │                    User confirms → store rule (confirmed: 1)
       ▼                    User rejects  → store as 'allow' (confirmed: 1)
  Pass through
  (not sensitive)
```

### Geofrey Updates Rules via Approval

Geofrey does NOT silently write rules. The flow is:

1. Geofrey detects something new
2. Geofrey proposes: "Soll ich `Müller GmbH` als personenbezogen markieren?"
3. User confirms or rejects
4. Only then is the rule written to DB + MD

## Scope: Global vs. Project

When the user confirms a new rule, Geofrey asks:

> "Gilt das nur für dieses Projekt oder für alle?"

- **Global**: Stored in `~/.geofrey/privacy.md` + SQLite with `scope = 'global'`
- **Project**: Stored in `<project>/.geofrey/privacy.md` + SQLite with `scope = '<project-path>'`

Examples:
- Person name, home address, phone number → typically global
- API keys, DB credentials, project-internal terms → typically project-scoped

## Performance Strategy

The 8B orchestrator must stay fast. Strategy: deterministic code handles the bulk, LLM only for genuine edge cases.

| Task | Method | Latency |
|------|--------|---------|
| API key detection | Regex | <1ms |
| Email/IP/phone detection | Regex | <1ms |
| Home path detection | Regex | <1ms |
| Connection string detection | Regex | <1ms |
| Custom term matching | String search | <1ms |
| Name/org extraction | Qwen3 8B (LLM) | 200-500ms |
| Image classification | Qwen3-VL-2B (on-demand) | 2-5s + load/unload |
| Scope decision | User prompt | N/A (async) |

Target: 90%+ of privacy decisions are deterministic (zero LLM latency).

## What Already Exists

| Component | Status | Location |
|-----------|--------|----------|
| Regex pattern detection | Done | `src/anonymizer/patterns.ts` |
| Mapping table (reversible) | Done | `src/anonymizer/mapping.ts` |
| De-anonymization (stream-safe) | Done | `src/anonymizer/deanonymizer.ts` |
| LLM name extraction | Done | `src/anonymizer/llm-extractor.ts` |
| Claude Code integration | Done | `src/anonymizer/anonymizer.ts` |
| Image EXIF stripping | Done | `src/security/image-sanitizer.ts` |
| Config schema | Done | `src/config/schema.ts` (anonymizer section) |
| Tests | Done | 31 tests passing |

## What Needs to Be Built

| Component | Description |
|-----------|-------------|
| Privacy Memory (SQLite table) | `privacy_rules` table in Drizzle schema |
| Privacy Memory (MD export) | Read/write `PRIVACY_RULES.md` (global + per-project) |
| Approval flow for new rules | "Soll ich X anonymisieren? Global oder nur hier?" |
| Image classifier integration | Qwen3-VL-2B on-demand load/process/unload via Ollama |
| Image routing logic | Category → OCR-only / describe / block |
| Email pre-processing | Anonymize email content before Claude Code |
| Hard block enforcement | Credentials + biometrie bypass prevention |
| Rule lookup in anonymizer | Check privacy_rules DB before LLM pass |
