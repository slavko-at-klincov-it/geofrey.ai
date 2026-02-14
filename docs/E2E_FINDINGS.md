# E2E Test Findings — Was wirklich funktioniert

Stand: 2026-02-14

## TL;DR

52 E2E-Tests geschrieben. 33 bestanden, 19 übersprungen. **0 Failures** — aber die Skips erzählen die wahre Geschichte. Die Unit-Tests (1248 grün) testen isolierte Funktionen mit Mocks. Die E2E-Tests haben 6 echte Architektur-Probleme aufgedeckt, die kein Unit-Test finden kann.

---

## Was funktioniert (echte Tests, echtes Ollama)

| Feature | E2E-Ergebnis | Bemerkung |
|---------|-------------|-----------|
| Risk Classifier (deterministisch) | **Funktioniert** | L0/L1/L2/L3 korrekt, Chained Commands erkannt |
| Risk Classifier (LLM-Fallback) | **Funktioniert, aber langsam** | 15–30s pro Klassifizierung |
| Anonymizer (Regex) | **Funktioniert** | Emails, API-Keys, IPs korrekt erkannt |
| Anonymizer (Custom Terms) | **Funktioniert** | "Max Testmann" → anonymisiert |
| Anonymizer (LLM Name Extraction) | **Funktioniert** | Qwen3 findet Namen in Freitext (~15s) |
| Anonymizer (Round-Trip) | **Funktioniert** | anonymize → deanonymize = Original |
| Output Filter | **Funktioniert** | Leaked `sk-ant-...` → `[REDACTED]` |
| Privacy Rules CRUD | **Funktioniert** | Create/List/Delete + allow/block Rules |
| Email Sanitization | **Funktioniert** | PII in Emails korrekt ersetzt |
| Auto-Tooling Gap Detection | **Funktioniert** | Alle 10 Patterns (DE+EN) erkannt |
| Onboarding Validation | **Funktioniert** | Token-Format, Config-Schema, Defaults |
| Conversation Persistence | **Funktioniert** | Messages speichern + abrufen |
| Approval Gate | **Funktioniert** | Promise-basiertes Blocking korrekt |

---

## Was NICHT funktioniert (durch E2E aufgedeckt)

### 1. Agent Loop kann nicht geladen werden
- **Symptom:** `Cannot access 'tools' before initialization`
- **Ursache:** Zirkuläre Imports: `index.ts` → `agent-loop.ts` → `tool-registry.ts` → `index.ts`
- **Impact:** Der komplette Agent-Loop (Kern-Feature!) kann nicht dynamisch importiert werden. Die 3 wichtigsten E2E-Tests (Simple Question, Error Handling, Cost Line) konnten nicht laufen.
- **Unit-Tests sagen:** Alles grün — weil sie `agent-loop.ts` nie direkt importieren, sondern einzelne Funktionen mocken.
- **Severity:** KRITISCH

### 2. Memory System funktioniert nicht mit Default-Model
- **Symptom:** Ollama `/api/embed` gibt 501 (Not Implemented) für `qwen3:8b`
- **Ursache:** `qwen3:8b` ist ein Generierungs-Model, kein Embedding-Model. Es gibt keinen Fallback.
- **Impact:** Alle 5 Memory-Tests übersprungen. Das bedeutet:
  - Semantische Suche in Memory → kaputt
  - Auto-Recall bei User-Messages → kaputt
  - Decision Conflict Guard → kaputt
  - Incremental Indexing → kaputt
- **Unit-Tests sagen:** Alles grün — weil Ollama-Aufrufe gemockt werden.
- **Fix nötig:** Ein separates Embedding-Model (z.B. `nomic-embed-text`) als Config-Option, ODER Fallback auf keyword-basierte Suche.
- **Severity:** HOCH

### 3. Drizzle Migrations waren kaputt
- **Symptom:** `RangeError: The supplied SQL string contains more than one statement`
- **Ursache:** `0004_add_webhooks.sql` und `0006_add_indexes.sql` fehlten `--> statement-breakpoint` Marker.
- **Impact:** Frische Installation = DB-Tabellen fehlen = App crasht.
- **Status:** Behoben während E2E-Entwicklung.
- **Unit-Tests sagen:** Alles grün — weil Unit-Tests in-memory DBs mit bereits erstellten Tabellen nutzen.
- **Severity:** KRITISCH (behoben)

### 4. Performance: 15–30s pro LLM-Klassifizierung
- **Symptom:** Risk Classifier LLM-Pfad braucht 15–30s pro Tool-Call
- **Ursache:** Kein Caching, kein Batching, keine Parallelisierung. Jeder unbekannte Tool-Call = voller Ollama-Roundtrip.
- **Impact:** Wenn ein User-Request 3 unbekannte Tools aufruft = 45–90s nur für Klassifizierung.
- **Unit-Tests sagen:** Alles grün — weil `classifyWithLlm()` gemockt wird und instant zurückkommt.
- **Severity:** HOCH (UX)

### 5. DB-Schema: 3 Tabellen nicht verdrahtet
- **Symptom:** `TODO: Not yet wired` Kommentare in `src/db/schema.ts`
- **Betroffene Tabellen:**
  - `approvals` → In-Memory-Map, geht bei Restart verloren
  - `webhook_configs` → In-Memory-Map, geht bei Restart verloren
  - `google_tokens` → Datei-basiert statt DB
- **Impact:** App-Restart = alle pending Approvals weg, alle Webhook-Configs weg.
- **Severity:** MITTEL

### 6. LLM-Fallback eskaliert immer zu L2
- **Symptom:** Wenn Qwen3 ungültiges XML zurückgibt → automatisch L2 (REQUIRE_APPROVAL)
- **Ursache:** `classifyWithLlm()` hat als Final-Fallback `RiskLevel.L2`
- **Impact:** Jeder nicht-deterministische Tool-Call, bei dem das LLM mal schlecht parst, blockiert den User mit einer Approval-Anfrage — auch wenn der Call harmlos ist (z.B. L0).
- **Severity:** MITTEL (UX)

---

## Docker-Tests (11 übersprungen)

Docker war auf dem Test-Rechner nicht verfügbar. Diese Tests sind korrekt übersprungen und sollten in CI/CD mit Docker-Socket laufen:
- Image Build (5min Timeout)
- Container Lifecycle
- Node-Version, Non-Root User
- Network Isolation, Memory Limits
- Volume Mounts

---

## Was Unit-Tests gut testen (und E2E nicht braucht)

- Regex-Pattern-Matching (deterministic classifier)
- Zod-Schema-Validierung
- Pure Functions (cosine similarity, token counting, cron parsing)
- Edge Cases (leere Strings, ungültige Inputs, Grenzwerte)
- Mocked HTTP-Responses (Telegram API Format, Ollama API Format)

---

## Fazit

Die Unit-Tests bestätigen, dass **einzelne Bausteine korrekt funktionieren**. Die E2E-Tests zeigen, dass **die Bausteine nicht richtig zusammengebaut sind**:

1. Der Agent-Loop (Herz des Systems) hat einen Circular-Import-Bug
2. Das Memory-System (Gedächtnis) funktioniert nicht mit dem Default-Model
3. Die DB-Migrations waren kaputt (behoben)
4. Die LLM-Latenz ist für Real-World-Nutzung zu hoch
5. State geht bei Restart verloren (Approvals, Webhooks)

**Nächste Schritte (Priorität):**
1. Circular Import in Agent-Loop auflösen
2. Embedding-Model als separate Config (z.B. `nomic-embed-text`)
3. LLM-Classifier Caching/Optimierung
4. Approval-Persistenz in SQLite verdrahten
