# geofrey — Offene Punkte (zentral)

> Einzige Stelle für alle offenen Punkte. Wird statt verteilter Listen in Journal/Roadmap/Findings gepflegt.

## Phase 1 — Noch offen

| Punkt | Priorität | Details |
|-------|-----------|---------|
| E2E-Test mit echtem Live-Task | Hoch | Einmal `geofrey task "..."` live ausführen und den vollen Kreislauf beobachten: enrich → execute → post_process → learn |
| LinkedIn Daten-Export | Niedrig | User macht Export separat, dann mehr Posts importieren (aktuell 38) |

## Selbstverbesserung — 5 Feedback-Loops

> Detaillierte Analyse: [docs/self-improvement-roadmap.md](self-improvement-roadmap.md)

| # | Loop | Aufwand | Abhängigkeit |
|---|------|---------|--------------|
| 1 | **Routing Feedback** — User kann Task-Type korrigieren, geofrey lernt | Mittel | — |
| 2 | **Decision Staleness** — valid_until + 90-Tage Warning | Niedrig | — |
| 3 | **Outcome Tracking** — exit_code + duration nach jeder Session loggen | Niedrig | — |
| 4 | **Keyword Evolution** — neue User-Wörter automatisch lernen | Mittel | Braucht #1 |
| 5 | **Section Relevanz** — welche Enrichment-Sections liefern Wert | Hoch | Braucht LLM-Analyse |

## Niedrige Priorität — Code Improvements

| Punkt | Quelle | Details |
|-------|--------|---------|
| "## Architecture" Heading für CLAUDE.md Content | UC-019 Acceptance Test | Heading irreführend wenn include_architecture=False, Content korrekt |
| Prefix-Keyword Double-Counting | UC-013 Acceptance Test | "doku" + "dokumentation" = 17 für ein Wort, kein Fehlrouting |

## Phase 2+ — Eigenständige Projekte

| Punkt | Status |
|-------|--------|
| macOS SwiftUI UI (Menübar-App, Chat, Dashboard) | Nicht gestartet |
| Gemini API Bildgenerierung | Bewusst deferred (manueller Workflow reicht) |
| Web UI | Phase 4 |
| CRM-Integration, E-Mail-Entwürfe | Phase 4 |
