# geofrey — Selbstverbesserungs-Roadmap

> Dokumentiert am 2026-03-28. Status: Analyse abgeschlossen, Implementierung offen.

## Was existiert (Lern-Mechanismen)

### Session Intelligence (intelligence.py)
- Extrahiert Learnings aus abgeschlossenen Claude Code Sessions
- 6 Kategorien: Decisions, Bugs, Discoveries, Negative Knowledge, Configuration, Patterns
- Map-Reduce Pipeline mit Qwen3.5 via Ollama
- Speichert als Markdown (Source of Truth) + ChromaDB Index
- Wird in nächsten Prompt injiziert via "## Known Context from Previous Sessions"

### Decision Extraction (intelligence.py + decisions.py)
- Strukturierte Decisions werden automatisch aus Sessions extrahiert
- Als Markdown+YAML Files in knowledge-base/decisions/{project}/ gespeichert
- 3-Level Conflict Detection: Scope, Keyword, Semantic
- Dependency Chain Traversal (depends_on, enables)
- Wird in nächsten Prompt injiziert via "## Active Decisions"

## Was fehlt — 5 Feedback-Loops

### 1. Routing Feedback
**Problem:** Wenn geofrey falsch routet ("add comment" → feature statt code-fix), wird der User nie gefragt und geofrey lernt nie.

**Impact:** "add a comment to auth.py" bekommt Feature-Pipeline (plan mode, $10 Budget, "Add tests for the new feature") obwohl der User nur einen Kommentar einfügen will.

**Lösung:** Nach dem Enrichment Summary eine optionale Korrektur-Möglichkeit: `[Enter] ok / [t] change type`. Korrekturen in einer Tracking-DB speichern. Über Zeit: Keyword-Gewichte anpassen basierend auf User-Korrekturen.

**Aufwand:** Mittel. UI-Änderung + SQLite Tracking-Tabelle.

### 2. Prompt Qualitäts-Feedback / Outcome Tracking
**Problem:** War der angereicherte Prompt gut? Hat Claude den Task erfolgreich erledigt? Kein Outcome-Tracking, kein Feedback-Loop.

**Impact:** Kein Signal ob Enrichment hilft oder schadet. Keine Möglichkeit Sections die Noise sind zu identifizieren.

**Lösung:** Nach jeder Session: exit_code + duration + token_usage in DB speichern. Über Zeit: Korrelation zwischen Enrichment-Sections und Erfolgsrate analysieren. Optional: User-Rating (thumbs up/down) nach Session.

**Aufwand:** Niedrig für Tracking, Hoch für Analyse.

### 3. Keyword Evolution
**Problem:** Keywords sind hardcoded in router.py. Neue Wörter die der User benutzt werden nie gelernt.

**Impact:** User sagt immer "verbessere" → geofrey kennt es nicht (kein Keyword dafür). Fällt auf code-fix Default zurück.

**Lösung:** Option A: Routing-Korrekturen (aus Loop 1) automatisch als neue Keywords extrahieren. Option B: Periodisch Session-Logs analysieren und häufige unerkannte Wörter als Keyword-Kandidaten vorschlagen.

**Aufwand:** Mittel. Braucht Loop 1 als Voraussetzung.

### 4. Decision Staleness / Validierung
**Problem:** Decisions werden extrahiert aber nie validiert. Sind sie noch aktuell? Wurde der Code seitdem geändert? Kein valid_until Timestamp.

**Impact:** Veraltete Decisions blockieren korrektes Handeln. "Do not switch to session-auth" blockiert auch wenn JWT längst durch OAuth ersetzt wurde.

**Lösung:** `valid_until` Feld in Decision Dataclass. Automatische Warnung wenn Decision älter als 90 Tage. `git log --since` Check ob Scope-Dateien seit Decision-Datum geändert wurden. Periodischer Review-Prompt via `geofrey decisions review`.

**Aufwand:** Niedrig für Staleness-Warning, Mittel für automatische Validierung.

### 5. Enrichment Section Relevanz
**Problem:** Waren die injizierten Sections nützlich? Hat Claude die Architecture-Section gelesen? Kein Tracking welche Sections Wert liefern.

**Impact:** Architecture-Section für "fix typo in README" ist Noise. Session-Learnings für ein neues Projekt sind leer aber nehmen Platz ein. Irrelevante Decisions verwirren Claude.

**Lösung:** Session-Output analysieren: hat Claude auf injizierte Sections referenziert? Über Zeit: Section-Relevanz-Score pro Task-Type berechnen. Low-relevance Sections automatisch weglassen.

**Aufwand:** Hoch. Braucht LLM-basierte Analyse der Session-Outputs.

## Empfohlene Reihenfolge

| Priorität | Loop | Quick Win? |
|-----------|------|------------|
| 1 | Routing Feedback | Ja — 1 Taste nach Summary |
| 2 | Decision Staleness | Ja — valid_until + 90-Tage Warning |
| 3 | Outcome Tracking | Ja — exit_code + duration loggen |
| 4 | Keyword Evolution | Nein — braucht Loop 1 |
| 5 | Section Relevanz | Nein — braucht LLM-Analyse |
