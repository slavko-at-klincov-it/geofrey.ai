# geofrey Acceptance Test — Master Findings

**50 Use Cases, 50 PASS**
**Datum:** 2026-03-28
**2 Bugs gefunden und gefixt, 0 offen**

## Bugs (gefixt)

| # | UC | Bug | Fix | Commit |
|---|-----|-----|-----|--------|
| 1 | UC-005 | Keyword "vulnerability" matched nicht Plural "vulnerabilities" | Stem "vulnerabilit" statt "vulnerability" | 99a8a19 |
| 2 | UC-011 | Keyword "pr" (für Pull Request) matched "prüfe", "problem", "process", etc. | "pr" entfernt, "pull request" Multi-Word reicht | 20efabe |

## Improvements (niedrige Priorität)

| UC | Finding | Auswirkung |
|----|---------|------------|
| UC-001/019 | "## Architecture" Heading für CLAUDE.md Content wenn include_architecture=False | Heading irreführend, Content korrekt |
| UC-013 | Prefix-Keywords verursachen Double-Counting ("doku" + "dokumentation" = 17 für ein Wort) | Kein Fehlrouting, aber unpräzises Scoring |

## Known Limitations

| UC | Limitation | Workaround |
|----|-----------|------------|
| UC-012 | Deutsche trennbare Verben ("Räume...auf" ≠ "aufräum") werden nicht erkannt | Infinitiv verwenden ("Code aufräumen") |

## Bestätigte Design-Entscheidungen

| UC | Entscheidung | Bestätigt durch |
|----|-------------|-----------------|
| UC-001/025 | Scope-Match ist der wichtigste Decision-Detection-Level | Auth-Decisions gefunden obwohl User "login" schrieb, nicht "jwt" |
| UC-004 | Längere Keywords dominieren kürzere (research=8 > nis2=4) | Korrektes Routing trotz Competition |
| UC-015 | vulnerability-Fix erhöhte Gap von 2 auf 14 | Robusteres Security-Routing |
| UC-020 | Auth-Decisions erscheinen bei Cart-Task (via Scope) | Korrekt — Claude soll wissen was kürzlich geändert wurde |
| UC-021 | Research-Prompt ist 5x kleiner als Feature-Prompt | Enrichment Rules formen Prompt radikal |
| UC-031 | Circular Dependency Walker terminiert korrekt | visited Set verhindert infinite loops |
| UC-032 | Superseded Decisions dreifach gefiltert | Kein Leaking von veralteten Decisions |
| UC-039 | rm -rf /tmp/test ist WARN, nicht BLOCK | Regex unterscheidet Root-Deletion von Subdirectory-Deletion |
| UC-044 | Nur feature/refactor brauchen Plan-Phase | Review/Research/Security sind selbst die Analyse |

## Statistik

| Kategorie | UCs | Pass | Bugs gefunden |
|-----------|-----|------|---------------|
| Task Routing EN | 7 | 7 | 1 (vulnerability) |
| Task Routing DE | 6 | 6 | 1 (pr false positive) |
| Task Routing Edge | 5 | 5 | 0 |
| Prompt Enrichment | 8 | 8 | 0 |
| Decision Detection | 7 | 7 | 0 |
| Safety Gates | 7 | 7 | 0 |
| Command Building | 4 | 4 | 0 |
| Queue Management | 3 | 3 | 0 |
| Briefing | 3 | 3 | 0 |
| **Gesamt** | **50** | **50** | **2** |
