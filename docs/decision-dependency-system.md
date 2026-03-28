# Decision Dependency System — Das fehlende Puzzlestück in AI-gestützter Softwareentwicklung

> **Autor:** Slavko Klincov + geofrey (Claude Opus 4.6)
> **Datum:** 2026-03-26
> **Status:** Research Finding + Architektur-Entwurf
> **Kontext:** Entstanden während einer Code-Review-Session des geofrey-Projekts, als die Frage aufkam: "Wie verhindern wir, dass Claude Code bewusste Entscheidungen rückgängig macht?"

---

## 1. Das Problem

### 1.1 Die Beobachtung

Jede Codeänderung hat einen Grund. Dieser Grund wird heute nirgends maschinenlesbar gespeichert. Das führt zu einem fundamentalen Problem in der Zusammenarbeit zwischen Mensch und AI Coding Assistant:

**Session A:** Entwickler und Claude Code entscheiden gemeinsam, `safety.py` zu löschen, weil die Safety-Logik über drei disconnected Systeme verstreut war. Die Konsolidierung auf `gates.py` war eine bewusste Architektur-Entscheidung.

**Session B (2 Wochen später):** Derselbe Entwickler bittet Claude Code "fix the safety system". Claude sieht keinen Safety-Code, keine `safety.py`, und erstellt eine neue — mit neuer Logik, die nichts mit der bewussten Konsolidierung zu tun hat.

**Das Ergebnis:** Ein Loop. Die Arbeit aus Session A wird unwissentlich rückgängig gemacht. Der Entwickler merkt es vielleicht nicht sofort. Der Code divergiert von der beabsichtigten Architektur.

### 1.2 Warum passiert das?

AI Coding Assistants wie Claude Code, Cursor, Copilot und Aider arbeiten **reaktiv und vorwärtsgerichtet**:

- Sie lesen den aktuellen Code
- Sie lesen statische Instruktionen (CLAUDE.md, .cursorrules)
- Sie sehen die letzten Commits (Einzeiler)
- Sie planen vorwärts: "Was muss ich tun, um den User-Wunsch zu erfüllen?"

**Was sie NICHT tun:**

- Fragen "Warum wurde das so gemacht?"
- Prüfen "Welche anderen Entscheidungen hängen davon ab?"
- Warnen "Du bist dabei, eine bewusste Entscheidung zu revertieren"
- Verstehen "Dieses Feld ist absichtlich leer, nicht versehentlich"

### 1.3 Die drei Ebenen von Änderungs-Wissen

```
Ebene 1: WAS        → Git Log: "deleted safety.py"
Ebene 2: WAS (besser) → Commit Message: "consolidate safety into gates.py"
Ebene 3: WARUM + WAS HÄNGT DAVON AB → Decision Log:
           "safety.py gelöscht WEIL 3 disconnected Systeme.
            gates.py ist jetzt Single Source of Truth.
            BETRIFFT: daemon.py, orchestrator.py, session.py
            WENN JEMAND SAFETY ÄNDERN WILL → nur gates.py anfassen"
```

Ebene 1 und 2 existieren in jedem Projekt. **Ebene 3 existiert in keinem Tool.**

### 1.4 Das Loop-Problem im Detail

Der Loop entsteht, weil AI Assistants keine Möglichkeit haben, zwischen diesen Szenarien zu unterscheiden:

| Szenario | Richtige Reaktion | Was AI heute tut |
|----------|-------------------|------------------|
| Code fehlt weil vergessen | Erstellen | Erstellen |
| Code fehlt weil bewusst entfernt | Fragen warum der User es will | Erstellen |
| Wert ist X weil Entscheidung Y | Warnen dass Änderung Y bricht | Ändern ohne Warnung |
| Feature ist simpel gehalten wegen Constraint Z | Z erklären, Alternativen vorschlagen | "Verbessern" mit Komplexität |
| Workaround existiert wegen Bug in Dependency | Workaround erklären | "Fixen" und Workaround entfernen |

In jedem dieser Fälle handelt die AI rational — sie sieht Code der "falsch" oder "fehlend" aussieht und "fixet" ihn. Das Problem ist nicht Intelligenz, sondern **fehlendes Kontextwissen über Intentionalität**.

---

## 2. Stand der Technik

### 2.1 Akademische Forschung

#### First Principles Framework (FPF) — arxiv 2601.21116

Das relevanteste Paper stammt von 2026 und adressiert exakt dieses Problem:

**Titel:** "AI-Assisted Engineering Should Track the Epistemic Status and Temporal Validity of Architectural Decisions"

**Kernthesen:**
- LLM Coding Assistants erzeugen Entscheidungen schneller als Teams sie validieren können
- Kein Standard-Framework unterscheidet zwischen Vermutung und verifiziertem Wissen
- **23% aller Architektur-Entscheidungen hatten innerhalb von 2 Monaten veraltete Evidenz**
- 86% dieser veralteten Entscheidungen wurden erst bei Incidents entdeckt — nicht präventiv

**Das Framework schlägt vor:**
- **F-G-R Trust Tuples:** Jede Entscheidung bekommt Scores für Formality (Rigor), Scope (Anwendbarkeit), Reliability (Zuverlässigkeit)
- **Conservative Aggregation (Gödel t-norm):** Keine Aggregation überschreitet das schwächste Glied — schwache Evidenz kann nicht durch Quantität kompensiert werden
- **Evidence Decay:** Alle Entscheidungen haben `valid_until` Timestamps; abgelaufene Evidenz löst Alerts aus

**Bewertung:** Theoretisch fundiert, aber rein akademisch. Keine Implementation, kein Tool, keine Integration in bestehende Workflows.

### 2.2 Existierende Tools und Ansätze

#### Architecture Decision Records (ADRs)

ADRs sind das etablierteste Format für Entscheidungs-Dokumentation:

```markdown
# ADR-001: Local-First Architecture

**Status:** Active
**Date:** 2026-03-13
**Context:** 78% der Zielgruppe lehnt Cloud-AI ab (Datenschutz)
**Decision:** Qwen3.5-9B via Ollama, keine externen LLM-Calls für Kernfunktionen
**Consequences:**
  - Kann nicht Claude API für Inference nutzen
  - Bildgenerierung nur via Gemini API (Ausnahme)
**Supersedes:** ADR-000 (Cloud-first Design)
```

**Stärken:** Strukturiert, menschenlesbar, versionierbar in Git
**Schwächen:** Statisch. Keine Abhängigkeiten. Keine automatische Prüfung. Kein Tool liest sie vor dem Planen.

#### Archgate — Executable ADRs

**URL:** https://archgate.dev/

Archgate ist der ambitionierteste Ansatz: ADRs werden zu TypeScript-Regeln (`.rules.ts`) kompiliert, die in CI, Pre-Commit Hooks und AI Agent Prompts laufen.

**Was es kann:**
- ADRs als Code (executable, testbar)
- AI Agents lesen ADRs bevor sie Code schreiben
- CI/CD Enforcement von Architektur-Regeln

**Was es NICHT kann:**
- Abhängigkeiten zwischen Entscheidungen tracken
- Warnen wenn eine neue Entscheidung eine alte bricht
- Temporal Reasoning ("war diese Entscheidung letzten Monat noch gültig?")
- Integration in Prompt Enrichment (es informiert, aber reichert nicht an)

#### Context Portal (ConPort) — MCP Server

**URL:** https://github.com/GreatScottyMac/context-portal

Ein MCP Server der einen projekt-spezifischen Knowledge Graph baut:

**Was es kann:**
- Speichert Entscheidungen, Fortschritt, Architektur mit Beziehungen
- SQLite + Vektor-Embeddings für semantische Suche
- Integriert mit Claude Code via MCP Protokoll

**Was es NICHT kann:**
- Deterministisch in jeden Prompt injizieren (nur on-demand via MCP Tool Call)
- Conflict Detection zwischen Entscheidungen
- Dependency Graph mit Impact Analysis

#### Zep — Temporal Knowledge Graph

**URL:** https://www.getzep.com/

**Was es kann:**
- Trackt wie Fakten sich über Zeit ändern (nicht nur Löschung)
- Temporal Reasoning: "Was war die Entscheidung letzten Monat?"
- Graphiti Engine: temporally-aware Knowledge Graph
- 94.8% Accuracy auf Benchmarks

**Was es NICHT kann:**
- Integration in AI Coding Assistants (fokussiert auf Chat/Support)
- Deterministische Prompt-Enrichment
- Code-spezifische Dependency Analysis

#### AI Coding Assistants — State of the Art

| Tool | Memory-System | Decision Tracking | Dependency Awareness |
|------|--------------|-------------------|---------------------|
| **Claude Code** | CLAUDE.md + Memory files | Nein | Nein |
| **Cursor** | .cursor/rules + Memory Bank | Basic (statische Regeln) | Nein |
| **Windsurf** | Cascade Session Memory | Besser als Cursor für Continuity | Nein |
| **Aider** | AiderDesk Memory (LanceDB) | Architektur-Entscheidungen speicherbar | Nein |
| **Copilot** | Repository-weiter Kontext | Nein | Nein |

**Fazit:** Kein einziger AI Coding Assistant hat ein Decision Dependency System.

### 2.3 Das "AI Loop" Problem in der Praxis

Das Problem ist dokumentiert, aber nicht gelöst:

- **Byldd.com:** "Tips to Avoid Falling Into an AI Fix Loop" — beschreibt wie Agents zwischen Lösungen oszillieren wenn widersprüchliche Constraints im Context stehen
- **Dredyson.com:** "Advanced AI Agent Loop Prevention" — erklärt dass Original-Bug + fehlgeschlagener Fix + neuer Error koexistieren und mathematische Unmöglichkeit erzeugen
- **Cursor 1.3.2+:** Trimmt stillschweigend ältere Instructions, was Loops erzeugt. Der "Fix" ist manuell: Session stoppen, frisch starten mit klarer Summary

**Root Cause:** Alle diese Loops entstehen, weil der Assistant nicht weiß WARUM etwas so ist wie es ist. Er sieht nur den Zustand und versucht ihn zu "verbessern".

### 2.4 Verwandte akademische Arbeiten

- **"Architecting Trust in Artificial Epistemic Agents"** (arxiv 2603.02960) — Trust in AI epistemic integrity
- **"Semantic Laundering in AI Agent Architectures"** (arxiv 2601.08333) — Warum Tool-Boundaries keine epistemische Garantie bieten
- **"PROV-AGENT: Unified Provenance for AI Agent Interactions"** (arxiv 2508.02866) — Provenance Tracking über agentic Workflows hinweg

---

## 3. Die Lücke

### 3.1 Was niemand hat

Die Kombination aus:

1. **Strukturiertes Decision Log** mit Abhängigkeiten (nicht nur ADRs, sondern ein Graph)
2. **Deterministischer Enrichment Layer** der Entscheidungen VOR dem LLM in den Prompt injiziert
3. **Conflict Detection** die erkennt wenn ein neuer Prompt eine bestehende Entscheidung berührt
4. **Temporal Awareness** die weiß wann Entscheidungen getroffen, geändert, oder aufgehoben wurden
5. **Automatische Warnung** an den User/LLM: "Du bist dabei, Entscheidung X zu revertieren. Das würde Y und Z brechen."

Einzelne Aspekte davon existieren in verschiedenen Tools (Archgate hat 1, Zep hat 4, ConPort hat Teile von 1+2), aber **die vollständige Integration existiert nirgends**.

### 3.2 Warum die Lücke existiert

- **LLMs sind stateless.** Jede Session startet bei Null. Context Windows sind groß, aber nicht persistent.
- **Coding Assistants optimieren für Aktion.** Der User will dass Code geschrieben wird, nicht dass Entscheidungen hinterfragt werden.
- **ADRs sind ein manueller Prozess.** Niemand pflegt sie nach dem Initial-Setup. Sie veralten schnell.
- **Dependency Tracking ist komplex.** Einen Graph von Entscheidungs-Abhängigkeiten zu bauen und aktuell zu halten erfordert Infrastruktur die über ein `.md` File hinausgeht.
- **Das Problem ist subtil.** Loops manifestieren sich als "merkwürdige Bugs" oder "der Code fühlt sich anders an", nicht als offensichtliche Errors.

### 3.3 Warum geofrey diese Lücke füllen kann

geofrey hat einen fundamentalen Architektur-Vorteil gegenüber allen genannten Tools:

**geofrey sitzt VOR dem LLM.**

```
User Input → geofrey Enricher → Claude Code CLI
                ↑
        Deterministisch, kein LLM
        Hat Zugriff auf Decision Log
        Kann Conflicts erkennen
        Kann Warnungen injizieren
        Bevor Claude Code den Prompt sieht
```

Das bedeutet:
- geofrey kann Entscheidungs-Kontext in JEDEN Prompt injizieren, ohne dass der User daran denken muss
- geofrey kann Conflicts erkennen BEVOR Claude Code anfängt zu planen
- geofrey kontrolliert den Prompt vollständig — Claude Code sieht nur was geofrey durchlässt
- Das alles passiert deterministisch, ohne LLM-Call, in Millisekunden

Kein anderer Ansatz hat diese Position im Stack. Archgate sitzt in CI/CD (zu spät). Zep sitzt neben dem LLM (kein Enrichment). ConPort ist on-demand (nicht automatisch).

---

## 4. Architektur-Entwurf: Decision Dependency System für geofrey

### 4.1 Übersicht

```
User Input → Router → Enricher
                         ↓
                  Decision Engine (NEU)
                  ├── Decision Log lesen (project-spezifisch)
                  ├── Relevante Entscheidungen finden (Keyword + Semantic)
                  ├── Abhängigkeiten auflösen
                  ├── Conflicts erkennen
                  └── Warnungen + Kontext generieren
                         ↓
                  Enriched Prompt (inkl. Decision Context)
                         ↓
                  Claude Code CLI (Plan Mode oder Execution)
                         ↓
                  Post-Session Intelligence
                  ├── Neue Entscheidungen extrahieren
                  ├── Decision Log updaten
                  └── Abhängigkeiten erkennen
```

### 4.2 Decision Log Format

Jede Entscheidung ist eine Markdown-Datei mit YAML Frontmatter:

```markdown
---
id: DEC-2026-0326-001
title: "Safety-System auf gates.py konsolidiert"
status: active                    # active | superseded | reverted | deprecated
date: 2026-03-26
project: geofrey
commit: 934c47f
category: architecture            # architecture | implementation | tooling | convention | security
scope:                            # Welche Dateien/Module betroffen
  - brain/gates.py
  - brain/session.py
  - brain/daemon.py
  - brain/orchestrator.py
depends_on: []                    # Entscheidungen von denen diese abhängt
enables:                          # Entscheidungen die diese ermöglicht
  - DEC-2026-0326-002            # Permission Model
blocks: []                        # Entscheidungen die diese verhindert
conflicts_with: []                # Entscheidungen die dieser widersprechen würden
supersedes: []                    # Entscheidungen die diese ersetzt
keywords:                         # Für Retrieval
  - safety
  - gates
  - validation
  - block
  - warn
  - security
---

## Entscheidung

safety.py wurde gelöscht. Alle Safety-Prüfungen laufen jetzt ausschließlich
über gates.py mit einem zweistufigen System: [BLOCK] verhindert Execution,
[WARN] ist advisory.

## Warum

Drei disconnected Safety-Systeme existierten parallel:
1. safety.py — RAG-basierte Safety-Chunk Injection (nie in den Enricher integriert)
2. gates.py — Pattern-Matching für gefährliche Commands (nur [WARN], nie [BLOCK])
3. Claude Code's eigene Safety (nicht kontrollierbar)

Keines war mit dem anderen verbunden. safety.py wurde importiert aber die
Funktion `get_safety_context()` wurde nur in der orphaned `retrieve_context()`
aufgerufen — nie im aktiven Enrichment-Flow.

## Alternativen die verworfen wurden

1. **Alle drei Systeme verbinden:** Zu komplex für den Nutzen. safety.py's
   RAG-Ansatz war overengineered für Pattern-Matching.
2. **safety.py in den Enricher integrieren:** Die Safety-Chunks sind Claude Code
   Knowledge, nicht Runtime-Safety. Sie gehören in die Knowledge Base, nicht
   in den Validation-Layer.

## Konsequenzen

- gates.py ist jetzt Single Source of Truth für Pre-Execution Validation
- [BLOCK] Patterns verhindern tatsächlich die Ausführung (vorher nie der Fall)
- Wer Safety-Logik ändern will, muss NUR gates.py anfassen
- Die 3 Safety-Chunk IDs in ALWAYS_INJECT sind jetzt obsolet

## Wenn jemand das ändern will

Wenn ein Prompt "Safety-System erweitern" oder "Safety-Chunks injizieren" enthält:
→ STOPP. Frage den User ob er gates.py erweitern will, nicht safety.py neu erstellen.
→ Erkläre dass safety.py bewusst entfernt wurde und warum.
```

### 4.3 Decision Relationship Types

```
depends_on:     "B kann nicht existieren ohne A"
                Beispiel: Permission Model hängt von der Session-Refactoring ab

enables:        "A macht B möglich"
                Beispiel: _build_claude_cmd() ermöglicht Permission-Modes

conflicts_with: "A und B können nicht gleichzeitig active sein"
                Beispiel: "Alle Sessions skip Permissions" vs "Permission Mode pro Skill"

supersedes:     "B ersetzt A"
                Beispiel: "gates.py mit [BLOCK]" supersedes "gates.py nur [WARN]"

blocks:         "A verhindert B"
                Beispiel: "Kein Web UI in Phase 1" blocks "React Dashboard bauen"
```

### 4.4 Enricher-Integration

Der bestehende Enricher (`brain/enricher.py`) wird um eine Decision-Stufe erweitert:

```python
def _gather_decision_context(
    user_input: str,
    project_name: str,
    config: dict,
) -> str:
    """Finde relevante Entscheidungen für diesen Prompt.

    1. Keyword-Match: Vergleiche Prompt-Keywords mit Decision-Keywords
    2. Scope-Match: Vergleiche betroffene Dateien mit Decision-Scopes
    3. Semantic-Match: ChromaDB Query für ähnliche Entscheidungen
    4. Conflict-Check: Prüfe ob der Prompt einer aktiven Entscheidung widerspricht
    """
```

Das Ergebnis wird als neue Section in den enriched Prompt injiziert:

```
## Active Decisions (relevant für diesen Task)

⚠ DECISION DEC-2026-0326-001: Safety-System auf gates.py konsolidiert
   Status: ACTIVE seit 2026-03-26 (Commit 934c47f)
   Scope: brain/gates.py, brain/session.py, brain/daemon.py
   Konsequenz: safety.py existiert NICHT — das ist Absicht, nicht ein Bug.
   Wenn du Safety ändern willst → nur gates.py anfassen.

ℹ DECISION DEC-2026-0326-002: Permission Model in session.py
   Status: ACTIVE seit 2026-03-26 (Commit 934c47f)
   Hängt ab von: DEC-2026-0326-001
   Scope: brain/session.py, brain/agents/base.py, brain/daemon.py
```

### 4.5 Conflict Detection

Die Conflict Detection ist der kritischste Teil — hier entscheidet sich ob das System einen echten Mehrwert bietet:

```python
def detect_decision_conflicts(
    user_input: str,
    affected_files: list[str],
    active_decisions: list[Decision],
) -> list[ConflictWarning]:
    """Erkennt potenzielle Konflikte zwischen Prompt und aktiven Entscheidungen.

    Prüft drei Ebenen:
    1. Direkter Widerspruch: Prompt will etwas das eine Decision explizit verhindert
       Beispiel: "Erstelle safety.py" vs DEC "safety.py bewusst gelöscht"

    2. Scope-Overlap: Prompt betrifft Dateien die unter aktiver Decision stehen
       Beispiel: "Refactor gates.py komplett" vs DEC "gates.py ist Single Source of Truth"

    3. Dependency-Break: Prompt würde eine Entscheidung ändern von der andere abhängen
       Beispiel: "Entferne _build_claude_cmd()" vs DEC "Permission Model hängt davon ab"
    """
```

### 4.6 Enrichment Rule Erweiterung

Die bestehenden YAML-Regeln werden um Decision-Kontext erweitert:

```yaml
# brain/rules/code-fix.yaml
task_type: code-fix
include_git_status: true
include_recent_commits: true
include_claude_md: true
include_architecture: false
include_session_learnings: true
include_dach_context: false
include_diff_scope: true
include_decision_context: true        # NEU
decision_scope:                        # NEU — welche Decision-Kategorien relevant
  - architecture
  - implementation
  - security
post_actions:
  - "Run existing tests to verify the fix"
  - "Document the root cause in a brief comment"
  - "Log new decisions if architecture choices were made"   # NEU
```

### 4.7 Post-Session Decision Extraction

Der bestehende Session Intelligence Pipeline (`knowledge/intelligence.py`) extrahiert bereits "decisions" als Kategorie. Die Erweiterung:

**Aktuell:**
```
Session → Chunk → LLM Extract → "decisions": ["Entscheidung X wurde getroffen"]
```

**Erweitert:**
```
Session → Chunk → LLM Extract → Structured Decisions:
  {
    "title": "Safety auf gates.py konsolidiert",
    "category": "architecture",
    "rationale": "3 disconnected Systeme waren nie integriert",
    "scope": ["brain/gates.py", "brain/safety.py"],
    "alternatives_rejected": ["Alle 3 verbinden", "safety.py in Enricher"],
    "dependencies": ["Permission Model braucht gates.py"],
    "keywords": ["safety", "gates", "validation"]
  }
```

Der Extraction-Prompt wird angepasst um diese Struktur zu verlangen. Die strukturierten Decisions werden dann als Decision Log Files gespeichert.

### 4.8 Decision Lifecycle

```
                    ┌──────────┐
                    │  ACTIVE  │ ← Entscheidung gilt
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐ ┌────────┐ ┌──────────┐
        │SUPERSEDED│ │REVERTED│ │DEPRECATED│
        └──────────┘ └────────┘ └──────────┘
         Ersetzt durch  Bewusst    Veraltet,
         neuere DEC     rückgängig  aber nicht
                        gemacht     explizit
                                    ersetzt
```

Jede Status-Änderung wird mit Grund und Datum dokumentiert. Superseded Decisions behalten einen Verweis auf ihren Nachfolger.

### 4.9 Storage-Architektur

**Filesystem (Source of Truth):**
```
knowledge-base/decisions/
├── geofrey/
│   ├── DEC-2026-0326-001-safety-consolidation.md
│   ├── DEC-2026-0326-002-permission-model.md
│   └── DEC-2026-0326-003-briefing-memory.md
├── meus/
│   └── ...
└── _index.yaml    # Dependency Graph als YAML
```

**ChromaDB (Retrieval):**
- Collection: `decisions`
- Embedding: Decision-Text + Keywords
- Metadata: id, project, status, category, date, scope, depends_on, keywords
- Ermöglicht semantische Suche: "Wie haben wir Safety gelöst?" → findet DEC-001

**SQLite (kein neues System nötig):**
- Die bestehende `meta` Tabelle in `geofrey_tasks.db` kann Decision-IDs tracken
- Oder: Eigene `decisions` Tabelle für schnelle Queries auf Status und Abhängigkeiten

### 4.10 Integration in CLAUDE.md

Jedes Projekt das über geofrey läuft bekommt diese Regel in seine CLAUDE.md:

```markdown
## Decision Awareness

Dieses Projekt nutzt ein Decision Log (knowledge-base/decisions/).
Bevor du Änderungen planst:
1. Lies relevante Decisions für die betroffenen Dateien
2. Wenn dein Plan einer aktiven Decision widerspricht → frage den User
3. Wenn du eine neue Architektur-Entscheidung triffst → dokumentiere sie
4. Lösche oder ändere keine Dateien die unter einer aktiven Decision stehen
   ohne explizite User-Bestätigung
```

---

## 5. Was geofrey bereits hat (Bestandsaufnahme)

### 5.1 Infrastruktur die direkt nutzbar ist

| Komponente | Was existiert | Readiness |
|-----------|--------------|-----------|
| Session Intelligence | Extrahiert "decisions" Kategorie aus Sessions | 80% |
| ChromaDB `session_learnings` | Speichert Decisions mit project/date/category Metadata | 100% |
| Context Gatherer | Queried bereits `"{project} decisions"` aus ChromaDB | 70% |
| Enricher | Kann jede neue Quelle als Section in den Prompt injizieren | 60% |
| Enrichment Rules (YAML) | Erweiterbar um `include_decision_context` Flag | 40% |
| Task.depends_on | Dependency-Model existiert bereits für Tasks | 100% |
| Agent Post-Processing | Hook nach Session-Ende, extrahiert Learnings | 100% |
| Knowledge Base (Markdown) | Source-of-Truth Pattern bereits etabliert | 100% |
| gates.py Validation | Kann um Decision-Conflict-Check erweitert werden | 50% |

### 5.2 Was gebaut werden muss

| Komponente | Aufwand | Priorität |
|-----------|---------|-----------|
| Decision Log Format (Markdown + Frontmatter) | Klein | Hoch |
| Decision Dataclass in models.py | Klein | Hoch |
| Decision File Parser (YAML Frontmatter → Decision) | Klein | Hoch |
| Enricher Hook: `_gather_decision_context()` | Mittel | Hoch |
| Conflict Detection Logic | Mittel | Hoch |
| Extraction Template Erweiterung (structured decisions) | Klein | Mittel |
| Decision Index (`_index.yaml` mit Dependency Graph) | Klein | Mittel |
| ChromaDB `decisions` Collection + Indexing | Klein | Mittel |
| CLI Commands (`geofrey decisions list/show/add`) | Mittel | Niedrig |
| Decision Status Lifecycle Management | Klein | Niedrig |
| Circular Dependency Detection | Klein | Niedrig |

---

## 6. Abgrenzung zu bestehenden Ansätzen

### 6.1 geofrey vs. Archgate

| Aspekt | Archgate | geofrey |
|--------|----------|---------|
| Format | TypeScript Rules | Markdown + YAML Frontmatter |
| Enforcement | CI/CD + Pre-Commit | Prompt Enrichment (vor LLM) |
| Timing | Nach dem Code | Vor dem Code |
| Dependency Graph | Nein | Ja |
| Conflict Detection | Regel-Matching | Keyword + Semantic + Scope |
| LLM-Integration | Informiert AI Agents | Injiziert in Prompt deterministisch |
| Overhead | TypeScript schreiben | Wird aus Sessions extrahiert |

**geofrey's Vorteil:** Decisions werden automatisch aus Sessions extrahiert, nicht manuell als Code geschrieben. Und sie werden VOR dem LLM injiziert, nicht als nachträglicher Check.

### 6.2 geofrey vs. Zep

| Aspekt | Zep | geofrey |
|--------|-----|---------|
| Knowledge Graph | Temporal, generisch | Decision-spezifisch, mit Dependencies |
| Integration | Chat/Support fokussiert | Claude Code CLI fokussiert |
| Temporal Reasoning | Ja (Kernfeature) | Ja (via Status + Timestamps) |
| Prompt Enrichment | Nein (externe API) | Ja (deterministisch, kein LLM) |
| Code-Awareness | Nein | Ja (Git, Diff Scope, File Paths) |

**geofrey's Vorteil:** Versteht Code-Kontext. Weiß welche Dateien von einer Entscheidung betroffen sind, nicht nur welches "Topic".

### 6.3 geofrey vs. ConPort

| Aspekt | ConPort | geofrey |
|--------|---------|---------|
| Protocol | MCP (on-demand) | Enrichment (automatisch) |
| Storage | SQLite + Embeddings | Markdown + ChromaDB |
| Trigger | LLM ruft Tool auf | Jeder Prompt wird enriched |
| Dependency Graph | Teilweise | Vollständig geplant |
| Decision Lifecycle | Nein | Active → Superseded → Reverted |

**geofrey's Vorteil:** Automatisch, nicht on-demand. Der LLM muss nicht "wissen" dass er Decisions prüfen soll — geofrey injiziert sie immer.

---

## 7. Breitere Implikationen

### 7.1 Für die AI Coding Assistant Industrie

Das Decision Dependency Problem wird mit zunehmender Adoption von AI Coding Assistants exponentiell schlimmer:

- **Mehr Sessions** = mehr Entscheidungen die getrackt werden müssen
- **Mehr Autonomie** (overnight agents, background tasks) = weniger menschliche Oversight
- **Mehr Projekte** = mehr Cross-Projekt Entscheidungen
- **Mehr Team-Mitglieder** = Entscheidungen die andere nicht kennen

Das FPF-Paper bestätigt: 23% Decay in 2 Monaten. Bei täglicher AI-Nutzung sind das hunderte veraltete Entscheidungen pro Quartal.

### 7.2 Für geofrey als Produkt

Ein funktionierendes Decision Dependency System wäre ein **USP** den kein Konkurrent hat:

- Cursor hat Rules, aber keine Dependencies
- Copilot hat Repository-Context, aber kein Decision Log
- Aider hat Memory, aber keine Conflict Detection
- Claude Code hat CLAUDE.md, aber keine Temporal Awareness

geofrey könnte das erste Tool sein, das sagt: "Bevor ich anfange zu coden, habe ich geprüft ob mein Plan bestehende Entscheidungen respektiert."

### 7.3 Für den DACH-Markt

Im DACH-Markt (Slavkos Zielmarkt) ist Nachvollziehbarkeit von Entscheidungen besonders wichtig:

- **DSGVO:** Entscheidungen über Datenverarbeitung müssen dokumentiert und begründet sein
- **NIS2:** Sicherheits-Entscheidungen müssen auditierbar sein
- **Österreichisches Recht:** "Warum wurde das so entschieden?" ist eine Standardfrage bei Audits
- **Enterprise-Kultur:** DACH-Unternehmen legen mehr Wert auf Prozess und Dokumentation als der US-Markt

Ein Decision Dependency System das automatisch dokumentiert WARUM Entscheidungen getroffen wurden, ist im DACH-Kontext nicht nur nice-to-have — es ist Compliance-relevant.

---

## 8. Offene Fragen und Risiken

### 8.1 Offene Design-Fragen

1. **Granularität:** Ab wann ist eine Code-Änderung eine "Entscheidung"? Jeder Commit? Nur Architektur-Änderungen? Wo ist die Grenze?

2. **Extraction Quality:** Kann ein 9B-Modell (Qwen3.5) zuverlässig strukturierte Entscheidungen aus Sessions extrahieren? Oder brauchen wir dafür Opus?

3. **Conflict Detection Precision:** Wie viele False Positives sind akzeptabel? Zu viele Warnungen und der User ignoriert sie. Zu wenige und Loops passieren trotzdem.

4. **Cross-Projekt Dependencies:** Entscheidung in Projekt A betrifft Projekt B. Wie handhabt geofrey das?

5. **Decision Decay:** Wann ist eine Entscheidung "alt genug" um hinterfragt zu werden? Das FPF-Paper schlägt explizite `valid_until` Timestamps vor — ist das praktikabel?

### 8.2 Risiken

1. **Over-Engineering:** Ein zu komplexes System das niemand pflegt ist schlimmer als kein System. Das Decision Log muss automatisch befüllt werden (Session Intelligence), nicht manuell.

2. **Noise:** Zu viel Decision-Kontext im Prompt kann Claude Code verwirren statt helfen. Die Injection muss gezielt sein — nur relevante Decisions, nicht alle.

3. **Stale Decisions:** Decisions die nie als superseded/reverted markiert werden, obwohl sie faktisch veraltet sind. Braucht einen Review-Mechanismus.

4. **Performance:** Wenn das Decision Log wächst, muss die Suche performant bleiben. ChromaDB Semantic Search + Keyword Filtering sollte ausreichen.

---

## 9. Zusammenfassung

### Das Problem
AI Coding Assistants wissen nicht WARUM Code so ist wie er ist. Sie sehen nur den Zustand. Das führt zu Loops, revertierten Entscheidungen, und inkrementellem Architektur-Verfall.

### Der Stand der Technik
Das Problem ist akademisch dokumentiert (FPF 2026), teilweise adressiert (Archgate, Zep, ConPort), aber **nirgends vollständig gelöst**. Kein Tool kombiniert Decision Dependencies + Prompt Enrichment + Conflict Detection.

### Die Lösung
Ein Decision Dependency System das:
- Entscheidungen automatisch aus Sessions extrahiert
- Abhängigkeiten zwischen Entscheidungen trackt
- Relevante Entscheidungen deterministisch in jeden Prompt injiziert
- Konflikte erkennt bevor der LLM anfängt zu planen

### Warum geofrey
geofrey sitzt VOR dem LLM. Diese Position im Stack ist einzigartig. geofrey kontrolliert den Prompt vollständig und kann Entscheidungs-Kontext injizieren ohne dass der User oder der LLM daran denken muss. 60-70% der benötigten Infrastruktur existiert bereits.

### Nächste Schritte
1. Decision Log Format definieren und erste Decisions manuell erstellen
2. Enricher um Decision-Context erweitern
3. Extraction Template für strukturierte Decisions anpassen
4. Conflict Detection implementieren
5. In realen Projekten testen und iterieren

---

## 10. Quellen

### Akademische Papers

1. **"AI-Assisted Engineering Should Track the Epistemic Status and Temporal Validity of Architectural Decisions"**
   arxiv 2601.21116, 2026
   https://arxiv.org/abs/2601.21116
   — First Principles Framework (FPF): F-G-R Trust Tuples, Evidence Decay, Conservative Aggregation. Zentrale Erkenntnis: 23% der Architektur-Entscheidungen veralten innerhalb von 2 Monaten.

2. **"Architecting Trust in Artificial Epistemic Agents"**
   arxiv 2603.02960, 2026
   https://arxiv.org/abs/2603.02960
   — Trust-Modelle für AI Agenten mit epistemischer Verantwortung.

3. **"Semantic Laundering in AI Agent Architectures"**
   arxiv 2601.08333, 2026
   https://arxiv.org/abs/2601.08333
   — Warum Tool-Boundaries keine epistemische Garantie bieten. Relevant für die Frage warum MCP alleine nicht reicht.

4. **"PROV-AGENT: Unified Provenance for Tracking AI Agent Interactions"**
   arxiv 2508.02866, 2025
   https://arxiv.org/abs/2508.02866
   — Provenance Tracking über agentic Workflows. Grundlage für Nachvollziehbarkeit von AI-Entscheidungen.

5. **"Provenance Documentation to Enable Explainable and Trustworthy AI"**
   Data Intelligence, MIT Press, Vol. 5, No. 1, 2023
   https://direct.mit.edu/dint/article/5/1/139/109494
   — Provenance als Grundlage für erklärbare AI.

### Tools und Plattformen

6. **Archgate — Executable Architecture Decision Records**
   https://archgate.dev/
   — ADRs als TypeScript Rules, CI/CD Enforcement, AI Agent Integration. Nächster existierender Ansatz zu Decision-aware AI Coding.

7. **Context Portal (ConPort) — MCP Server für Knowledge Graphs**
   https://github.com/GreatScottyMac/context-portal
   — Projekt-spezifische Knowledge Graphs mit Decisions, Progress, Architecture. SQLite + Vektor-Embeddings.

8. **Zep — Temporal Knowledge Graph Platform**
   https://www.getzep.com/
   — Graphiti Engine: temporally-aware Knowledge Graph. Trackt wann Fakten ungültig wurden. 94.8% Accuracy auf Benchmarks.

### Blog Posts und Artikel

9. **Chris Swan: "Using Architecture Decision Records (ADRs) with AI coding assistants"**
   2025-07-10
   https://blog.thestateofme.com/2025/07/10/using-architecture-decision-records-adrs-with-ai-coding-assistants/
   — Argumentiert dass ADRs "the obviously good way" sind, AI Assistants Kontext zu geben. Prognose: ADRs werden von Elite-Praxis zu Boilerplate für AI-Arbeit.

10. **"Tips to Avoid Falling Into an AI Fix Loop"**
    Byldd.com, 2025
    https://byldd.com/tips-to-avoid-ai-fix-loop/
    — Dokumentation des Loop-Problems: Agents oszillieren zwischen Lösungen bei widersprüchlichen Constraints.

11. **"Advanced AI Agent Loop Prevention: Expert Techniques"**
    Dredyson.com, 2025
    https://dredyson.com/advanced-ai-agent-loop-prevention-expert-techniques-to-fix-repetition-issues-in-cursor-ide
    — Root Cause Analyse: Original Bug + Failed Fix + New Error koexistieren im Context. Mathematische Unmöglichkeit erzeugt Oszillation.

12. **"How to Supercharge Cursor with Memory Banks"**
    Lullabot.com, 2025
    https://www.lullabot.com/articles/supercharge-your-ai-coding-cursor-rules-and-memory-banks
    — Cursor Memory Banks: Architektur-Entscheidungen persistent speichern. Zeigt die Notwendigkeit, löst aber nicht das Dependency-Problem.

### AI Coding Assistant Dokumentation

13. **Claude Code** — https://docs.anthropic.com/en/docs/claude-code
    CLAUDE.md, Memory System, Plan Mode, Hooks. Kein Decision Tracking.

14. **Cursor** — https://docs.cursor.com/
    .cursor/rules, Memory Bank. Kein Dependency Graph.

15. **Aider** — https://aider.chat/
    AiderDesk Memory mit LanceDB. Speichert Entscheidungen, aber keine Abhängigkeiten.

---

*Dieses Dokument ist selbst ein Beispiel für das Problem das es beschreibt: Wenn in einer zukünftigen Session jemand fragt "Warum hat geofrey ein Decision Log?", sollte dieses Dokument die Antwort sein — nicht ein LLM das raten muss.*
