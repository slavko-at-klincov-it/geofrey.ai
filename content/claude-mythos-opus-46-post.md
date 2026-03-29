# LinkedIn Post: Claude Mythos Leak vs. Opus 4.6 Realität

## Status: ENTWURF — Review durch Slavko ausstehend

---

## Post-Entwurf (Deutsch, LinkedIn-Format)

Anthropics neues KI-Modell "Claude Mythos" wurde geleakt — und die Cybersecurity-Welt dreht durch.

Cybersecurity-Aktien brechen um 6-9% ein.
Analysten sprechen vom "mächtigsten Hacking-Tool aller Zeiten."
Und das Internet feiert die nächste Revolution.

Aber ich sitze hier und denke mir: Moment mal.

Ich arbeite jeden Tag mit Claude Code. Opus 4.6 — dem aktuellen Flaggschiff von Anthropic. Und ich baue gerade einen autonomen AI Agent (geofrey) — genau mit diesem Modell.

Und die Realität?

Ich musste ein komplettes Guardian-System bauen, weil Claude Code seine eigenen Anweisungen nicht einhält. Über 1.999 analysierte Nachrichten in 29 Projekten haben gezeigt: 35% aller meiner Nachrichten sind Korrekturen. Nicht weil ich meine Meinung ändere — sondern weil Claude abdriftet.

Konkret:
- Claude löscht Dateien die bewusst konsolidiert wurden — und erstellt sie in der nächsten Session neu, weil es die Entscheidung vergessen hat.
- Es schlägt strukturelle Änderungen vor auf Basis von "Halbwissen" — ohne die Architektur-Entscheidungen zu kennen die dahinterstehen.
- Es ändert Dateien die niemand angefragt hat. Task: "fix login bug" → Claude ändert 5 Files.
- Es dreht sich in Schleifen — liest dieselben Files fünfmal, spawnt unnötige Subprozesse.
- Es interpretiert Prompts um und beantwortet Fragen die nie gestellt wurden.
- Und das Schlimmste: Es ist dabei maximal selbstsicher. 50+ Sessions dokumentiert wo die Analyse "confident but wrong" war.

Mein Zitat dazu: "Claude macht einen Vorschlag auf Basis von Halbwissen, ich vertraue ihm, sage ja, dann macht er komplett was anderes — und manchmal merke ich's gar nicht."

Deshalb habe ich ein Decision Dependency System gebaut. Weil kein einziger AI Coding Assistant — weder Claude Code, noch Cursor, noch Copilot, noch Aider — maschinenlesbar speichert WARUM eine Entscheidung getroffen wurde und was davon abhängt.

Das bin nicht nur ich. Tausende Entwickler melden dasselbe:
- 6.000+ offene Issues auf GitHub
- 58% Performance-Drop nach einer Konfigurations-Änderung im Februar
- Tasks die 5 Minuten dauerten, brauchen jetzt 20-30 Minuten
- Entwickler beschreiben Opus 4.6 als "lobotomized" und "nerfed"

Und jetzt soll ein noch größeres Modell — Mythos — alles lösen?

Hier ist mein Punkt:

Anthropic kann nicht mal die internen Blog-Posts absichern. Ein CMS war von "private" auf "public" gestellt. 3.000 unveröffentlichte Dokumente lagen offen im Netz. Entdeckt von einem Forscher, nicht von Anthropic selbst.

Ein Unternehmen das ein Modell mit "beispiellosen Cybersecurity-Risiken" ankündigt, lässt genau diese Ankündigung über eine menschliche Fehlkonfiguration leaken.

Die Ironie braucht keine Erklärung.

Aber der Markt versteht etwas anderes nicht:

Stärkere AI-Modelle machen Cybersecurity nicht überflüssig — sie machen sie notwendiger als je zuvor. Jedes Tool das Schwachstellen findet, kann auch von Angreifern genutzt werden. Und der größte Angriffsvektor bleibt der Mensch. Wie eben beim Leak.

Wer Cybersecurity-Aktien wegen Mythos verkauft, hat die Dynamik nicht verstanden.

Was mich aber wirklich beschäftigt:

Bevor Anthropic die nächste Revolution verspricht, sollten sie vielleicht erst das aktuelle Produkt zum Laufen bringen. Opus 4.6 hatte in den letzten 8 Wochen mehr Regressionen als Features. Und die ehrliche Empfehlung der Community? Wechsle zurück auf Opus 4.5.

Ich baue jeden Tag mit diesen Tools. Und der Unterschied zwischen Marketing-Versprechen und Entwickler-Realität war selten so groß.

---

## Recherche-Zusammenfassung

### 1. Claude Mythos Leak (27. März 2026)

**Was passiert ist:**
- Anthropics internes CMS wurde durch menschliche Fehlkonfiguration von "private" auf "public" gestellt
- ~3.000 unveröffentlichte Assets waren öffentlich zugänglich
- Entdeckt von Roy Paz (LayerX Security) und Alexandre Pauwels (University of Cambridge)
- Anthropic bestätigte: "human error"

**Was Mythos ist:**
- Neues Modell-Tier namens "Capybara" — größer als Opus
- Flaggschiff-Modell heißt "Claude Mythos"
- Zwei Versionen des Draft-Blogposts gefunden: eine mit "Mythos", eine mit "Capybara"
- Laut Anthropic: "a step change" in AI performance, "the most capable we've built to date"
- "Dramatically higher scores" als Opus 4.6 in Coding, Reasoning und Cybersecurity
- "Far ahead of any other AI model in cyber capabilities"
- Kann autonom Schwachstellen finden, verifizieren und exploiten — ohne menschliche Anleitung

**Marktreaktion:**
- iShares Cybersecurity ETF: -4.5%
- CrowdStrike, Palo Alto Networks, Zscaler: je ~-6%
- SentinelOne: -6%
- Okta, Netskope: je >-7%
- Tenable: -9%
- Microsoft: -3%
- Bitcoin fiel auf $66.000

**Release-Status:**
- Noch nicht öffentlich verfügbar
- "Very expensive for us to serve" laut internem Blogpost
- Anthropic arbeitet an Effizienz vor General Release
- Wird aktuell bei großen Cybersecurity-Firmen getestet

**Quellen:**
- [Fortune: Exclusive Anthropic Mythos Leak](https://fortune.com/2026/03/26/anthropic-says-testing-mythos-powerful-new-ai-model-after-data-leak-reveals-its-existence-step-change-in-capabilities/)
- [Fortune: Cybersecurity Risk](https://fortune.com/2026/03/27/anthropic-leaked-ai-mythos-cybersecurity-risk/)
- [CNBC: Cybersecurity stocks fall](https://www.cnbc.com/2026/03/27/anthropic-cybersecurity-stocks-ai-mythos.html)
- [The Decoder: Mythos dramatically higher scores](https://the-decoder.com/anthropic-leak-reveals-new-model-claude-mythos-with-dramatically-higher-scores-on-tests-than-any-previous-model/)
- [CoinDesk: Cybersecurity Nightmare](https://www.coindesk.com/markets/2026/03/27/anthropic-s-massive-claude-mythos-leak-reveals-a-new-ai-model-that-could-be-a-cybersecurity-nightmare)
- [Futurism: Most Ironic Way Possible](https://futurism.com/artificial-intelligence/anthropic-step-change-new-model-claude-mythos)
- [Techzine: Step-change Mythos model](https://www.techzine.eu/news/applications/140017/details-leak-on-anthropics-step-change-mythos-model/)
- [Investing.com: Cybersecurity stocks plunge](https://www.investing.com/news/stock-market-news/cybersecurity-stocks-plunge-as-anthropics-claude-mythos-leak-sparks-ai-fear-4584897)
- [Lowcode Agency: What is Claude Mythos](https://www.lowcode.agency/blog/what-is-claude-mythos)

---

### 2. Opus 4.6 Probleme — Dokumentierte Issues

**Performance-Regression (seit Februar 2026):**
- Konfigurations-Änderung am 10.-11. Februar führte zu 58% Performance-Drop
- Gleiche Tasks: vorher 92/100, nachher 38/100
- Tasks die 5 Min. dauerten: jetzt 20-30 Min. mit Babysitting
- Effektive Produktivität ~50-60% geringer
- 6.000+ offene Issues auf GitHub (Tendenz steigend)

**Konkrete Symptome:**
- **Instruction Ignoring:** Explizite Anweisungen werden komplett ignoriert
- **Code-Duplikation:** Gleiche Code-Blöcke werden mehrfach generiert (E-Mail-System sendet doppelt, DB-Operationen dupliziert)
- **Schleifen:** Liest dieselben Dateien mehrfach, spawnt unnötige Subagents
- **Halluzination:** Bei >256K Token Context beginnt das Modell zu fabrizieren
- **Prompt-Uminterpretation:** Statt die gestellte Frage zu beantworten, substituiert es eigene Interpretation
- **Dateien ändern ohne Auftrag:** Modifiziert Files die nicht angefragt wurden
- **"Confident but wrong":** Generiert sichere, detaillierte Analysen die bei Prüfung nicht halten — über 50+ Sessions dokumentiert

**Recurring Outages (März 2026):**
- 2. März, 11. März, 17.-18. März: wiederkehrende Ausfälle
- Sessions hängen 10-15+ Minuten bei einfachen Prompts
- Rate-Limit-Probleme speziell bei Opus 4.6
- Anthropic am 27. März: Sonnet behoben, Opus-Fix "pending"

**Community-Empfehlung:**
- Für Coding: Sonnet 4.6 ist derzeit zuverlässiger als Opus 4.6
- Für Stabilität: Zurück auf Opus 4.5 wechseln
- Context unter 256K Token halten
- Bei 40% Context-Füllung: neue Session starten

**Token-Verbrauch:**
- Opus 4.6 verbraucht ~5x mehr Tokens pro Task als 4.5 (Adaptive Thinking)
- Denkt standardmäßig härter → Budget wird schneller verbraucht

**Quellen:**
- [GitHub #24991: Critical Opus 4.6 Configuration Regression](https://github.com/anthropics/claude-code/issues/24991)
- [GitHub #28469: Comprehensive regression — loops, memory loss](https://github.com/anthropics/claude-code/issues/28469)
- [GitHub #30027: Confident Unverified Analysis Pattern](https://github.com/anthropics/claude-code/issues/30027)
- [GitHub #31480: Production automations broken](https://github.com/anthropics/claude-code/issues/31480)
- [GitHub #32166: Does not read prompts properly](https://github.com/anthropics/claude-code/issues/32166)
- [GitHub #35981: Recurring outages March 17-18](https://github.com/anthropics/claude-code/issues/35981)
- [GitHub #21270: Claude got really stupid again](https://github.com/anthropics/claude-code/issues/21270)
- [Cursor Forum: Opus 4.6 was fun for 1 week](https://forum.cursor.com/t/opus-4-6-was-fun-for-1-week-why/155751)
- [PopularAITools: Claude Code Opus nerfed](https://popularaitools.ai/blog/claude-code-opus-nerfed-march-2026)
- [MacRumors: Rapid Rate Limit Drain](https://www.macrumors.com/2026/03/26/claude-code-users-rapid-rate-limit-drain-bug/)
- [TeamBlind: Opus 4.6 still ain't it](https://www.teamblind.com/post/opus-46-still-aint-it-ha8hkud6)
- [Threads: Is Opus 4.6 feeling dumber?](https://www.threads.com/@silv4nojr/post/DWNjG_UDH5e/)

---

### 3. Eigene Erfahrungen (Slavko / geofrey-Projekt — aus Repo dokumentiert)

**Das Kernproblem (DEC-006, dokumentiert über 1.999 Nachrichten in 29 Projekten):**

> "Claude macht einen Vorschlag auf Basis von Halbwissen, ich vertraue ihm, sage ja, dann macht er komplett was anderes und manchmal merke ich's gar nicht."

- **35%** aller Nachrichten sind Korrekturen (User holt Claude zurück auf Kurs)
- **45%** sind Bestätigungen ("ok", "ja") — hohes Vertrauen in Claude
- **Toxische Kombination:** Hohes Vertrauen + häufige Korrekturen = Claude driftet unbemerkt ab

**Das Loop-Problem (docs/decision-dependency-system.md):**
- Session A: `safety.py` wird bewusst gelöscht, Safety in `gates.py` konsolidiert (DEC-001)
- Session B (2 Wochen später): "fix the safety system" → Claude sieht keine safety.py → erstellt eine neue
- Ergebnis: Arbeit aus Session A rückgängig gemacht. Entwickler merkt es erst später.
- Claude kann nicht unterscheiden: "Code fehlt weil vergessen" vs. "Code fehlt weil bewusst entfernt"

**Warum geofrey als Guardian gebaut wurde (docs/guardian-architecture.md):**
- Guardian Monitor überwacht Claude's Output in Echtzeit auf Signalwörter: "I'll move", "I'll restructure", "I'll replace"
- Prüft gegen dokumentierte Decisions (DEC-001 bis DEC-007)
- Warnt User BEVOR er blind "ja" sagt
- Beispiel: Claude will auth in neues Modul verschieben → DEC sagt "auth.py ist Single Source" → Warnung

**Agent-Diskussion Findings (docs/agent-discussion-findings.md):**
- Guardian, Observer, Review waren DEAD CODE im Interactive Mode — gebaut, getestet, aber nie angebunden
- Monitor pollt alle 10s, aber Claude committet in 2-3s → Guardian sieht Fehler zu spät (Timing-Lücke)
- Sessions ohne Timeout → hängende Claude Sessions blockieren gesamten Overnight-Queue

**Decision Dependency System — Weltweit einzigartig:**
- Kein AI Coding Assistant (Claude Code, Cursor, Copilot, Aider, Windsurf) hat ein System das:
  - Abhängigkeiten zwischen Entscheidungen trackt
  - Warnt wenn eine neue Entscheidung eine alte bricht
  - Maschinenlesbar speichert WARUM etwas entschieden wurde
- 23% aller Architektur-Entscheidungen hatten innerhalb von 2 Monaten veraltete Evidenz (FPF Framework, arxiv 2601.21116)
- 86% dieser veralteten Entscheidungen wurden erst bei Incidents entdeckt — nicht präventiv

**Knowledge Erosion (Session Learning 2026-03-24):**
- Claude generiert wertvolles Wissen während Sessions (Debugging-Findings, Architektur-Entscheidungen)
- Dieses Wissen geht nach Session-Ende verloren → "Knowledge Erosion" Pattern
- Deshalb Session Intelligence Pipeline mit Map-Reduce Extraktion gebaut

---

### 4. Die zentrale These für den Post

| Mythos-Hype | Opus 4.6 Realität |
|---|---|
| "Step change in capabilities" | 58% Performance-Drop nach Config-Änderung |
| "Dramatically higher scores" | 6.000+ offene GitHub Issues |
| "Autonomous vulnerability hunting" | Kann nicht mal Anweisungen befolgen |
| "Far ahead in cyber capabilities" | CMS-Leak durch menschliche Fehlkonfiguration |
| Cybersecurity-Aktien brechen ein | Die echte Bedrohung ist die Lücke zwischen Versprechen und Lieferung |

**Kernaussage:** Bevor man über die nächste Revolution spricht, sollte das aktuelle Produkt funktionieren. Und stärkere AI macht Cybersecurity nicht überflüssig — sie macht sie notwendiger.
