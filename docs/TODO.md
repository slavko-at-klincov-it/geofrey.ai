# geofrey — Offene Punkte (zentral)

> Einzige Stelle für alle offenen Punkte. Stand: 2026-03-28.

## Erledigte Punkte (diese Session)

| Punkt | Status |
|-------|--------|
| Decision Dependency System (6 Schritte) | ✅ |
| 50 Acceptance Tests + 100 Live LLM Tests | ✅ |
| Intent Layer (LLM statt Keywords) | ✅ |
| Guardian Monitor (aktive Session-Überwachung) | ✅ |
| Observer (Output-Triage) | ✅ |
| Quality Review (Post-Actions → Prüffragen) | ✅ |
| execute_spec → monitor_session (Finding 1) | ✅ |
| Orphaned RUNNING Tasks Recovery (Finding 4) | ✅ |
| Neues Projekt erstellen mit Git+GitHub (Finding 5) | ✅ |
| JSONL Zuordnung per Timestamp (Finding 6) | ✅ |
| Post-Actions auto-converted (Finding 10) | ✅ |
| Safety Gate auf Original-Input (P0) | ✅ |
| Task-Type Fehlklassifizierungen verbessert (P1) | ✅ |
| max_budget_usd entfernt, max_turns=200 | ✅ |
| Personal Context in jedem Prompt | ✅ |
| Overnight Research Agent | ✅ |
| Proaktive Fragen-Queue | ✅ |
| Enrichment Summary (transparente Anzeige) | ✅ |
| Preflight Checks + launchd Plist Fix | ✅ |
| 33 redundante Knowledge Chunks entfernt | ✅ |
| Deutsche Keywords erweitert | ✅ |
| Few-Shot Examples im Intent-Template | ✅ |

## Noch offen

### Hoch

| Punkt | Details |
|-------|---------|
| E2E-Test mit echtem Live-Task | `geofrey task "..."` einmal live ausführen und den vollen Kreislauf beobachten |
| Finding 7: Große Sessions | 50MB JSONL → 2000 Chunks × 5s = stundenlange Verarbeitung. Map-Phase braucht Limit. |

### Mittel

| Punkt | Details |
|-------|---------|
| Finding 8: Decisions akkumulieren | Nach 6 Monaten ~360 Files, kein Caching, keine Staleness. `valid_until` Feld fehlt. |
| Finding 9: Self-Protection | Keine Decision die sagt "lösche nicht das Decision System". Meta-Schutz fehlt. |
| LinkedIn Daten-Export | User macht das separat, dann mehr Posts importieren |

### Selbstverbesserung (5 Feedback-Loops)

> Details: [docs/self-improvement-roadmap.md](self-improvement-roadmap.md)

| # | Loop | Status |
|---|------|--------|
| 1 | Routing Feedback (User korrigiert Task-Type) | Offen |
| 2 | Decision Staleness (valid_until + 90-Tage Warning) | Offen |
| 3 | Outcome Tracking (exit_code + duration loggen) | Offen |
| 4 | Keyword Evolution (neue User-Wörter lernen) | Offen |
| 5 | Section Relevanz (welche Sections liefern Wert) | Offen |

### Phase 2+ (Eigenständige Projekte)

| Punkt | Status |
|-------|--------|
| macOS SwiftUI UI (Menübar-App, Chat, Dashboard) | Nicht gestartet |
| Gemini API Bildgenerierung | Bewusst deferred |
| Web UI | Phase 4 |
