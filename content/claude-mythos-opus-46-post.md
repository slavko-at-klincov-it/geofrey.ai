# LinkedIn Post: Claude Mythos Leak vs. Opus 4.6 Realität

## Status: ENTWURF — Review durch Slavko ausstehend

---

## Post-Entwurf (Deutsch, LinkedIn-Format)

Anthropics neues KI-Modell "Claude Mythos" wurde geleakt — und die Cybersecurity-Welt dreht durch.

Cybersecurity-Aktien brechen um 6-9% ein.
Analysten sprechen vom "mächtigsten Hacking-Tool aller Zeiten."
Und das Internet feiert die nächste Revolution.

Aber ich sitze hier und denke mir: Moment mal.

Ich arbeite jeden Tag mit Claude Code. Opus 4.6 — dem aktuellen Flaggschiff von Anthropic. Und die Realität sieht so aus:

Das Modell vergisst Anweisungen mitten in der Session.
Es ändert Dateien, die niemand angefragt hat.
Es dreht sich in Schleifen und liest dieselben Files fünfmal.
Es interpretiert Prompts um und beantwortet Fragen, die nie gestellt wurden.
Und es produziert Code-Duplikate, die in Produktion zu Datenkorruption führen würden.

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

### 3. Eigene Erfahrungen (Slavko / geofrey-Projekt)

> **Hinweis:** Ich habe keinen Zugriff auf frühere Konversationen mit dir. Die folgenden Punkte basieren auf dem, was du in dieser Session beschrieben hast und was im Projekt dokumentiert ist. Bitte ergänze spezifische Beispiele aus deiner Erfahrung:

**Platzhalter für persönliche Beispiele:**
- [ ] Konkretes Beispiel 1: ___(z.B. "Claude hat meine gates.py gelöscht obwohl nur ein Test gefixt werden sollte")___
- [ ] Konkretes Beispiel 2: ___(z.B. "Session hat 45 Minuten für einen 5-Zeilen-Fix gebraucht")___
- [ ] Konkretes Beispiel 3: ___(z.B. "Opus hat Decisions ignoriert und strukturelle Änderungen vorgeschlagen die DEC-006 widersprechen")___
- [ ] Konkretes Beispiel 4: ___(z.B. "Musste 3x korrigieren weil es den falschen Ansatz gewählt hat")___

**Aus dem geofrey-Projekt ableitbar:**
- Das geofrey Guardian-System (DEC-006) wurde GENAU wegen solcher Probleme gebaut — Claude driftet ab, ignoriert Decisions, schlägt strukturelle Änderungen vor die gegen Architektur-Entscheidungen verstoßen
- Safety Gates prüfen doppelt (Original-Input UND enriched Prompt), weil "LLM kann destructive Intent reinigen" — ein direktes Symptom der Unzuverlässigkeit

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
