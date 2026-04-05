"""Markt-Intelligence -- akkumuliert Wissen und matcht mit eigenen Projekten.

Zentrales Modul fuer alle Helferlein die Markt-Informationen sammeln
(Reddit, LinkedIn, FreelancerMap, etc.). Statt Einmal-Proposals baut
es eine wachsende Knowledge Base auf und erkennt wo Slavkos eigene
Projekte als Loesung passen.

Ablauf:
1. Helferlein findet Thema (z.B. Reddit-Post über Steuerberater-Mangel)
2. intelligence.py prueft: Gibt es schon ein Wissensstand-File dazu?
   - Ja: Aktualisiere es mit dem neuen Fund
   - Nein: Erstelle neues Wissensstand-File
3. intelligence.py prueft: Passt ein eigenes Projekt als Loesung?
   - Ja: Erstelle Proposal mit Aktionsvorschlag (dort posten, promoten, kontaktieren)
   - Nein: Nur Knowledge Base Update, kein Proposal

Knowledge Base: knowledge-base/marktforschung/{thema-slug}.md
Format: Markdown mit YAML Frontmatter (wie Decisions)
"""

import logging
import re
from datetime import datetime
from pathlib import Path

from brain.proposals import create_proposal, has_pending_proposal

logger = logging.getLogger("geofrey.intelligence")

# Project capabilities for matching
# Maps project name -> keywords + beschreibung that describe what the project solves
PROJECT_CAPABILITIES = {
    "aibuchhalter": {
        "keywords": [
            "buchhaltung", "rechnung", "steuer", "steuerberater", "invoice",
            "buchhalter", "ear", "einnahmen", "ausgaben", "uva", "finanzamt",
            "belegorganisation", "kontierung", "saldenliste", "steuererklärung",
            "kmu", "epu", "selbststaendig", "freiberuf", "einzelunternehm",
            "rechnungssoftware", "belegerfassung", "ocr",
        ],
        "beschreibung": "AIBuchhalter: KI-gestützte Buchhaltung für österreichische EPU/KMU. "
                        "Automatische Rechnungserkennung (95% ohne KI), Bankabgleich, "
                        "USt-Zahllast, CRM, Angebote, wiederkehrende Rechnungen. Lokal, DSGVO-konform.",
        "url": "klincov.it",
        "zielgruppe": "Selbstständige, EPU, KMU im DACH-Raum",
    },
    "meus": {
        "keywords": [
            "notiz", "gedanken", "second brain", "wissen", "pkm",
            "organisation", "todo", "aufgabe", "erinnerung", "tagebuch",
            "journal", "idee", "brainstorm", "vergessen", "merken",
            "produktivität", "focus", "gedächtnis", "privacy", "offline",
            "sprachnotiz", "voice", "whisper", "lokal", "on-device",
        ],
        "beschreibung": "Meus: Intelligenter Second Brain mit On-Device KI. "
                        "Gedanken per Sprache/Text erfassen, automatisch clustern, "
                        "Spaced Repetition. 100% lokal, kein Cloud. iOS + Desktop.",
        "url": "meus.info",
        "zielgruppe": "Wissensarbeiter, Kreative, Privacy-bewusste Nutzer",
    },
    "geofrey": {
        "keywords": [
            "automatisierung", "agent", "assistent", "overnight", "nacht",
            "ki-assistent", "workflow", "orchestr", "prompt", "claude",
            "llm", "rag", "knowledge", "freelancer", "akquise",
            "content", "linkedin", "helferlein", "solo", "überfordert",
        ],
        "beschreibung": "geofrey: Autonomer AI-Agent der nachts arbeitet. "
                        "Recherchiert, crawlt, checkt Projekte, generiert Vorschläge. "
                        "Morgens Approval-Dashboard. Für Solo-Unternehmer.",
        "url": "geofrey.ai",
        "zielgruppe": "Solo-Unternehmer, Freelancer, KMU-Gründer",
    },
    "anomyze": {
        "keywords": [
            "dsgvo", "datenschutz", "anonymisierung", "privacy", "pii",
            "personenbezogen", "gdpr", "chatgpt", "ki", "llm",
            "data protection", "anonymize", "pseudonymisier",
            "browser extension", "compliance",
        ],
        "beschreibung": "Anomyze: DSGVO-konforme Datenanonymisierung bevor Texte an "
                        "ChatGPT/Claude gesendet werden. Browser Extension + API. "
                        "Erkennt Namen, IBANs, Adressen automatisch.",
        "url": "anomyze.it",
        "zielgruppe": "Unternehmen die KI nutzen aber DSGVO einhalten müssen",
    },
    "klincovit-website": {
        "keywords": [
            "power platform", "power automate", "power apps", "copilot",
            "microsoft 365", "governance", "coe", "citizen development",
            "sharepoint", "beratung", "consulting", "workshop",
            "digital transformation", "low-code", "no-code",
        ],
        "beschreibung": "Klincov IT: Beratung für Microsoft 365 & Power Platform, "
                        "KI-Beratung & Entwicklung. Governance, CoE, Copilot Strategie.",
        "url": "klincov.it",
        "zielgruppe": "KMU und Enterprises im DACH-Raum",
    },
    "ane-training-iphone": {
        "keywords": [
            "ane", "apple neural engine", "iphone training", "on-device training",
            "coreml", "mlx", "iphone", "neural engine", "ml compile",
            "mobile training", "on-device ml", "apple silicon training",
            "transformer training", "fine-tune iphone", "fine-tune mobile",
            "training on phone", "train on device", "ios ml", "ios training",
            "mil compiler", "ane kernels",
        ],
        "beschreibung": "ANE-Training-iPhone: Erstes Open-Source Transformer-Training "
                        "direkt auf dem iPhone Neural Engine, ohne Jailbreak. "
                        "110M Parameter, 2.4 Steps/Sec auf A17 Pro, 72 ANE Kernels.",
        "url": "github.com/slavko-at-klincov-it/ANE-Training-iPhone",
        "zielgruppe": "ML/AI Researchers, iOS Developers, On-Device ML Community",
    },
    "lael": {
        "keywords": [
            "ollama", "lm studio", "llama.cpp", "local llm", "local ai",
            "gpu monitor", "vram", "ram monitor", "model monitor",
            "ai monitor", "runtime monitor", "menu bar", "macos ai",
            "gpt4all", "koboldcpp", "mlx", "localai",
        ],
        "beschreibung": "Lael (LocalAIEventLog): Native macOS Menu Bar App die alle "
                        "lokalen KI-Modelle überwacht. 14+ Runtimes, RAM-Alerts, Widgets.",
        "url": "github.com/slavko-at-klincov-it/Lael-LocalAIEventLog",
        "zielgruppe": "Developers die lokale LLMs laufen lassen",
    },
    "copyvoice": {
        "keywords": [
            "voice clone", "voice cloning", "tts", "text to speech",
            "stimme klonen", "qwen tts", "speech synthesis",
            "voice synthesis", "apple silicon tts", "local tts",
        ],
        "beschreibung": "copyVoice: Voice Cloning mit Qwen3-TTS auf Apple Silicon. "
                        "15 Sekunden Referenz-Audio reichen. 100% lokal.",
        "url": "",
        "zielgruppe": "Content Creators, Podcaster, Developers",
    },
    "transcriptllm": {
        "keywords": [
            "whisper", "transkription", "transcription", "meeting notes",
            "meeting summary", "german llm", "deutsch llm", "speech to text",
            "meeting protokoll", "audio transcri", "german speech",
        ],
        "beschreibung": "TranscriptLLM: Deutsche LLM + Whisper Benchmarks, Meeting-Transkription "
                        "mit automatischer Zusammenfassung. Qwen 2.5 7B empfohlen.",
        "url": "",
        "zielgruppe": "Teams die Meetings transkribieren, German NLP Community",
    },
}


def match_projects(text: str) -> list[dict]:
    """Find which of Slavko's projects match a problem description.

    Returns list of {project, score, beschreibung, keywords_matched}.
    Score = number of keyword matches.
    """
    text_lower = text.lower()
    matches = []

    for project, info in PROJECT_CAPABILITIES.items():
        matched_keywords = [kw for kw in info["keywords"] if kw in text_lower]
        if len(matched_keywords) >= 2:  # At least 2 keyword matches
            matches.append({
                "project": project,
                "score": len(matched_keywords),
                "beschreibung": info["beschreibung"],
                "url": info.get("url", ""),
                "zielgruppe": info.get("zielgruppe", ""),
                "keywords_matched": matched_keywords,
            })

    matches.sort(key=lambda m: m["score"], reverse=True)
    return matches


def update_knowledge_base(
    thema: str,
    quelle: str,
    fund: dict,
    config: dict,
) -> Path:
    """Update or create a Wissensstand file for a market topic.

    Args:
        thema: Topic slug (e.g. "steuerberater-mangel")
        quelle: Source (e.g. "reddit", "linkedin", "freelancermap")
        fund: Dict with keys: title, url, text, score, date, subreddit/platform
        config: geofrey config

    Returns path to the updated knowledge file.
    """
    geofrey_root = Path(__file__).parent.parent.parent
    kb_dir = geofrey_root / "knowledge-base" / "marktforschung"
    kb_dir.mkdir(parents=True, exist_ok=True)

    slug = _slugify(thema)
    filepath = kb_dir / f"{slug}.md"

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    fund_entry = _format_fund(fund, quelle, now)

    if filepath.exists():
        # Append new finding to existing file
        content = filepath.read_text(encoding="utf-8")

        # Update the "last_updated" in frontmatter
        content = re.sub(
            r'last_updated: .*',
            f'last_updated: "{now}"',
            content,
        )

        # Count existing findings
        finding_count = content.count("### Fund")
        new_num = finding_count + 1

        # Append the new finding
        content += f"\n### Fund {new_num} ({now})\n{fund_entry}\n"
        filepath.write_text(content, encoding="utf-8")
        logger.info(f"Updated knowledge: {slug} (Fund {new_num})")
    else:
        # Create new Wissensstand file
        project_matches = match_projects(
            fund.get("title", "") + " " + fund.get("text", "")
        )
        match_section = ""
        if project_matches:
            match_lines = []
            for m in project_matches:
                match_lines.append(
                    f"- **{m['project']}**: {m['beschreibung'][:100]}... "
                    f"(Match: {', '.join(m['keywords_matched'][:5])})"
                )
            match_section = (
                f"\n## Eigene Loesungen\n\n"
                + "\n".join(match_lines)
                + "\n"
            )

        content = (
            f"---\n"
            f"thema: \"{thema}\"\n"
            f"created: \"{now}\"\n"
            f"last_updated: \"{now}\"\n"
            f"quellen: [\"{quelle}\"]\n"
            f"relevanz: \"offen\"\n"
            f"---\n\n"
            f"# {thema}\n\n"
            f"## Zusammenfassung\n\n"
            f"Thema erstmals gefunden am {now} auf {quelle}.\n"
            f"Weitere Analyse noetig.\n"
            f"{match_section}\n"
            f"## Funde\n\n"
            f"### Fund 1 ({now})\n{fund_entry}\n"
        )
        filepath.write_text(content, encoding="utf-8")
        logger.info(f"New knowledge file: {slug}")

    return filepath


def create_opportunity_proposal(
    thema: str,
    fund: dict,
    project_match: dict,
    quelle: str,
) -> bool:
    """Create a proposal when a Reddit/LinkedIn finding matches an own project.

    The proposal suggests where and how to promote the project as a solution.
    """
    project = project_match["project"]
    title = f"Opportunity: {project} passt zu '{thema[:50]}'"

    if has_pending_proposal("marktforschung", title[:30]):
        return False

    fund_url = fund.get("url", "")
    fund_title = fund.get("title", "")
    keywords = ", ".join(project_match["keywords_matched"][:5])

    prompt = (
        f"Slavko hat ein Projekt '{project}' das zu einem aktuellen Markt-Beduerfnis passt.\n\n"
        f"Markt-Beduerfnis (gefunden auf {quelle}):\n"
        f"- Thema: {thema}\n"
        f"- Konkreter Post: {fund_title}\n"
        f"- URL: {fund_url}\n"
        f"- Keyword-Match: {keywords}\n\n"
        f"Slavkos Projekt:\n"
        f"- Name: {project}\n"
        f"- Was es tut: {project_match['beschreibung']}\n"
        f"- Website: {project_match.get('url', '')}\n"
        f"- Zielgruppe: {project_match.get('zielgruppe', '')}\n\n"
        f"Aufgabe:\n"
        f"1. Analysiere ob das Projekt wirklich zum Beduerfnis passt\n"
        f"2. Wenn ja: Schreibe einen hilfreichen Kommentar/Post der das Projekt "
        f"als Loesung vorschlaegt, OHNE nach Spam auszusehen\n"
        f"3. Wenn nein: Sage ehrlich dass es nicht passt\n\n"
        f"Stil: Hilfreich, nicht werblich. Erfahrung teilen, nicht verkaufen.\n"
        f"Sprache: Deutsch. Kein Emoji. Keine Em-Dashes."
    )

    create_proposal(
        helferlein="marktforschung",
        title=title,
        description=(
            f"Dein Projekt '{project}' passt zum Thema '{thema}'.\n\n"
            f"Quelle: {quelle} - {fund_title}\n"
            f"URL: {fund_url}\n"
            f"Keyword-Match: {keywords}\n\n"
            f"Projekt: {project_match['beschreibung']}\n\n"
            f"Vorschlag: Claude Code analysiert ob ein hilfreicher Kommentar/Post sinnvoll ist."
        ),
        priority="high",
        action_type="draft",
        evidence=[fund_url] if fund_url else [],
        prepared_prompt=prompt,
        prepared_plan=(
            f"1. Markt-Beduerfnis vs. Projekt-Features abgleichen\n"
            f"2. Hilfreichen Kommentar/Post formulieren (kein Spam)\n"
            f"3. Text zur Pruefung bereitstellen"
        ),
        project=project,
    )

    logger.info(f"Opportunity: {project} <-> {thema}")
    return True


def _slugify(text: str) -> str:
    """Convert text to a filesystem-safe slug."""
    text = text.lower().strip()
    text = re.sub(r'[äÄ]', 'ae', text)
    text = re.sub(r'[öÖ]', 'oe', text)
    text = re.sub(r'[üÜ]', 'ue', text)
    text = re.sub(r'[ß]', 'ss', text)
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text[:60].strip('-')


def _format_fund(fund: dict, quelle: str, timestamp: str) -> str:
    """Format a finding as markdown."""
    lines = []
    lines.append(f"- **Quelle:** {quelle}")
    if fund.get("title"):
        lines.append(f"- **Titel:** {fund['title']}")
    if fund.get("url"):
        lines.append(f"- **URL:** {fund['url']}")
    if fund.get("subreddit"):
        lines.append(f"- **Subreddit:** r/{fund['subreddit']}")
    if fund.get("score"):
        lines.append(f"- **Score:** {fund['score']} Upvotes, {fund.get('num_comments', '?')} Kommentare")
    if fund.get("text"):
        text_preview = fund["text"][:300].replace("\n", " ")
        lines.append(f"- **Auszug:** {text_preview}")
    return "\n".join(lines)
