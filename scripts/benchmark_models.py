#!/usr/bin/env python3
"""Benchmark local LLMs with real geofrey helferlein tasks.

Tests reasoning quality + speed for the specific prompts geofrey uses:
1. Reddit Finding Reasoning (filter relevant from irrelevant)
2. Project Matching (does a Reddit post match an own project?)
3. Knowledge Synthesis (summarize + suggest action)
4. German Business Text (application draft quality)
"""

import json
import time
import ollama


# --- Test Data: Real geofrey scenarios ---

TEST_REDDIT_FINDINGS = """
Du bist geofrey, ein autonomer Assistent fuer Slavko Klincov.

Kontext ueber Slavko:
- Solo-Unternehmer, klincov.it
- Fokus: Microsoft 365, Power Platform, KI-Beratung
- Projekte: AIBuchhalter (Buchhaltung), Meus (Second Brain), geofrey (AI Agent), Anomyze (DSGVO)
- Markt: DACH, deutsch/englisch
- Sucht: Leads, Kunden, Projektausschreibungen

Der Helferlein 'marktforschung' hat folgende Funde gemacht:

1. Titel: Kein Steuerberater nimmt neue Klienten
   Beschreibung: Ich bin seit 2 Jahren selbststaendig und finde einfach keinen Steuerberater. Alle voll.

2. Titel: Windows gaslightet seine User
   Beschreibung: Rant ueber Windows Bloatware und Telemetrie.

3. Titel: Rechnungssoftware fuer mein klein Unternehmen?
   Beschreibung: Suche eine einfache Rechnungssoftware fuer EPU in Oesterreich. Muss USt-konform sein.

4. Titel: Bewerbungen schreiben ist die groesste Zeitverschwendung
   Beschreibung: 50 Bewerbungen geschrieben, null Antworten. Gibt es keine bessere Loesung?

5. Titel: Erbe und Vermoegensuebertra gung: Niessbrauch
   Beschreibung: Frage zu Erbschaftssteuer und Niessbrauch in Deutschland.

Bewerte jeden Fund:
- Ist er relevant fuer Slavko? (basierend auf seinen Projekten, Skills, Zielen)
- Wenn ja: welche Prioritaet (high/normal/low) und warum?
- Gibt es eine konkrete Aktion die Slavko unternehmen sollte?

Antworte als JSON Array. Fuer jeden Fund:
{"index": 1, "relevant": true/false, "priority": "high/normal/low", "reasoning": "kurze Begruendung", "action_suggestion": "konkrete Aktion oder leer"}

Sei streng. Nur wirklich relevante und actionable Funde durchlassen.
"""

EXPECTED_REASONING = {
    1: True,   # Steuerberater -> AIBuchhalter relevant
    2: False,  # Windows rant -> irrelevant
    3: True,   # Rechnungssoftware -> AIBuchhalter direct match
    4: False,  # Bewerbungen -> maybe interesting but not core
    5: False,  # Erbrecht -> irrelevant
}

TEST_PROJECT_MATCH = """
Analysiere ob Slavkos Projekt zum Reddit-Fund passt:

Reddit-Fund: "Rechnungssoftware fuer mein klein Unternehmen? Suche eine einfache Buchhaltung fuer EPU in Oesterreich. Muss USt und EAR koennen."

Slavkos Projekt: AIBuchhalter - KI-gestuetzte Buchhaltung fuer oesterreichische EPU/KMU. Automatische Rechnungserkennung, Bankabgleich, USt-Zahllast, CRM. Lokal, DSGVO-konform.

1. Passt das Projekt zum Beduerfnis? Ja oder Nein mit Begruendung.
2. Wenn ja: Schreibe einen hilfreichen Reddit-Kommentar (3-4 Saetze, nicht werblich, hilfreich).

Antworte auf Deutsch. Kein Emoji.
"""

TEST_GERMAN_DRAFT = """
Du bist Slavko Klincov, freiberuflicher Power Platform & KI-Berater.
Website: klincov.it

Schreibe einen Bewerbungstext (max 150 Worte) fuer:
Titel: Power Automate Spezialist fuer Logistik-KMU
Plattform: FreelancerMap
Beschreibung: Wir suchen einen erfahrenen Power Automate Entwickler fuer die Automatisierung unserer Logistikprozesse. SharePoint Integration, Genehmigungsworkflows.

Anforderungen:
- Deutsch, professionell, persoenlich
- Referenz auf Erfahrung bei Gebrueder Weiss (Logistik!)
- Kein Emoji, keine Em-Dashes
"""


def benchmark_model(model: str) -> dict:
    """Run all tests on a model, measure quality + speed."""
    results = {"model": model, "tests": {}}

    # Test 1: Reddit Reasoning (JSON output)
    print(f"\n  Test 1: Reddit Reasoning...", end=" ", flush=True)
    start = time.time()
    try:
        resp = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": TEST_REDDIT_FINDINGS}],
            format="json",
            think=False,
            options={"temperature": 0.3},
        )
        elapsed = time.time() - start
        text = resp["message"]["content"]

        # Parse and score
        try:
            data = json.loads(text)
            if isinstance(data, dict) and "results" in data:
                data = data["results"]
            if not isinstance(data, list):
                data = [data]

            correct = 0
            total = 0
            for item in data:
                idx = item.get("index", 0)
                if idx in EXPECTED_REASONING:
                    total += 1
                    if item.get("relevant", None) == EXPECTED_REASONING[idx]:
                        correct += 1

            accuracy = correct / total if total else 0
            results["tests"]["reasoning"] = {
                "accuracy": accuracy,
                "correct": correct,
                "total": total,
                "time_s": round(elapsed, 1),
                "details": data,
            }
            print(f"{accuracy:.0%} accuracy, {elapsed:.1f}s")
        except json.JSONDecodeError:
            results["tests"]["reasoning"] = {"accuracy": 0, "time_s": round(elapsed, 1), "error": "JSON parse failed"}
            print(f"JSON error, {elapsed:.1f}s")
    except Exception as e:
        results["tests"]["reasoning"] = {"error": str(e)}
        print(f"ERROR: {e}")

    # Test 2: Project Match
    print(f"  Test 2: Project Match...", end=" ", flush=True)
    start = time.time()
    try:
        resp = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": TEST_PROJECT_MATCH}],
            think=False,
            options={"temperature": 0.3},
        )
        elapsed = time.time() - start
        text = resp["message"]["content"]
        has_match = "ja" in text.lower()[:100]
        has_comment = len(text) > 200
        results["tests"]["project_match"] = {
            "correct_match": has_match,
            "has_comment": has_comment,
            "time_s": round(elapsed, 1),
            "response_preview": text[:300],
        }
        print(f"match={'yes' if has_match else 'no'}, comment={'yes' if has_comment else 'no'}, {elapsed:.1f}s")
    except Exception as e:
        results["tests"]["project_match"] = {"error": str(e)}
        print(f"ERROR: {e}")

    # Test 3: German Draft
    print(f"  Test 3: German Draft...", end=" ", flush=True)
    start = time.time()
    try:
        resp = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": TEST_GERMAN_DRAFT}],
            think=False,
            options={"temperature": 0.3},
        )
        elapsed = time.time() - start
        text = resp["message"]["content"]
        word_count = len(text.split())
        has_gw = "weiss" in text.lower() or "gebrüder" in text.lower()
        has_emoji = any(ord(c) > 0x1F600 for c in text)
        results["tests"]["german_draft"] = {
            "word_count": word_count,
            "mentions_gw": has_gw,
            "no_emoji": not has_emoji,
            "time_s": round(elapsed, 1),
            "response_preview": text[:400],
        }
        print(f"{word_count} words, GW ref={'yes' if has_gw else 'no'}, {elapsed:.1f}s")
    except Exception as e:
        results["tests"]["german_draft"] = {"error": str(e)}
        print(f"ERROR: {e}")

    return results


def main():
    models = ["qwen3.5:9b", "qwen3.5:27b", "gemma4:26b"]

    print("=" * 60)
    print("geofrey LLM Benchmark - echte Helferlein-Aufgaben")
    print("=" * 60)

    all_results = []
    for model in models:
        print(f"\n{'='*40}")
        print(f"Model: {model}")
        print(f"{'='*40}")
        result = benchmark_model(model)
        all_results.append(result)

    # Summary
    print(f"\n{'='*60}")
    print("ZUSAMMENFASSUNG")
    print(f"{'='*60}")
    print(f"{'Modell':20s} {'Reasoning':12s} {'Match':8s} {'Draft':8s} {'Total Zeit':12s}")
    print("-" * 60)
    for r in all_results:
        reasoning = r["tests"].get("reasoning", {})
        match = r["tests"].get("project_match", {})
        draft = r["tests"].get("german_draft", {})

        acc = f"{reasoning.get('accuracy', 0):.0%}"
        match_ok = "OK" if match.get("correct_match") else "FAIL"
        draft_ok = "OK" if draft.get("mentions_gw") and draft.get("no_emoji") else "WARN"

        total_time = sum(
            t.get("time_s", 0)
            for t in [reasoning, match, draft]
        )

        print(f"{r['model']:20s} {acc:12s} {match_ok:8s} {draft_ok:8s} {total_time:8.1f}s")


if __name__ == "__main__":
    main()
