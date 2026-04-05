"""Helferlein system -- autonomous helpers that gather, reason, and propose.

Three-phase architecture:
1. GATHER (Python, deterministic): crawl, fetch, scan, diff
2. REASON (local LLM, free): filter, prioritize, contextualize findings
3. PROPOSE (Python): create proposals only for what survives reasoning

The local LLM (Qwen 3.5 9B) decides what's worth the user's attention.
Claude Code CLI only runs after the user approves a proposal.
"""

import json
import logging
from typing import Protocol

logger = logging.getLogger("geofrey.helferlein")


class Helferlein(Protocol):
    """Interface for all helferlein."""

    name: str

    def run(self, config: dict) -> int:
        """Run this helferlein. Returns number of proposals created."""
        ...


# Registry of active helferlein
_registry: list[type] = []


def register(cls: type) -> type:
    """Decorator to register a helferlein class."""
    _registry.append(cls)
    return cls


def run_all_helferlein(config: dict) -> int:
    """Run all registered helferlein. Returns total proposals created.

    Each helferlein is isolated -- one failure doesn't stop the others.
    """
    total = 0
    for cls in _registry:
        try:
            helferlein = cls()
            count = helferlein.run(config)
            total += count
            if count:
                logger.info(f"Helferlein '{helferlein.name}': {count} proposal(s)")
        except Exception as e:
            name = getattr(cls, "name", cls.__name__)
            logger.error(f"Helferlein '{name}' failed: {e}")
    return total


def reason_about_findings(
    helferlein_name: str,
    findings: list[dict],
    config: dict,
) -> list[dict]:
    """Local LLM decides which findings become proposals and why.

    Takes raw findings from a helferlein's gather phase and returns
    only the ones worth creating proposals for, enriched with the
    LLM's reasoning about priority and relevance.

    Each finding dict should have at least: title, description.
    Returns findings enriched with: relevant (bool), priority, reasoning, action_suggestion.

    Falls back to passing all findings through if Ollama is unavailable.
    """
    if not findings:
        return []

    from brain.llm import ask_json

    # Build context about the user and their projects
    context = _build_user_context(config)

    # Load recent rejection patterns
    rejections = _get_recent_rejections(helferlein_name)

    # Batch findings into groups of 5 for efficiency
    enriched = []
    for i in range(0, len(findings), 5):
        batch = findings[i:i+5]
        batch_result = _reason_batch(helferlein_name, batch, context, rejections, config)
        enriched.extend(batch_result)

    # Filter to only relevant findings
    relevant = [f for f in enriched if f.get("relevant", True)]
    filtered_count = len(findings) - len(relevant)
    if filtered_count:
        logger.info(f"Reasoning filtered {filtered_count}/{len(findings)} findings for {helferlein_name}")

    return relevant


def _reason_batch(
    helferlein_name: str,
    findings: list[dict],
    context: str,
    rejections: str,
    config: dict,
) -> list[dict]:
    """Ask local LLM to evaluate a batch of findings."""
    from brain.llm import ask_json

    findings_text = ""
    for i, f in enumerate(findings):
        findings_text += (
            f"\n{i+1}. Titel: {f.get('title', '?')}\n"
            f"   Beschreibung: {f.get('description', '')[:300]}\n"
        )

    prompt = (
        f"Du bist geofrey, ein autonomer Assistent fuer Slavko Klincov.\n\n"
        f"Kontext ueber Slavko:\n{context}\n\n"
        f"Der Helferlein '{helferlein_name}' hat folgende Funde gemacht:\n"
        f"{findings_text}\n"
        f"{rejections}\n"
        f"Bewerte jeden Fund:\n"
        f"- Ist er relevant fuer Slavko? (basierend auf seinen Projekten, Skills, Zielen)\n"
        f"- Wenn ja: welche Prioritaet (high/normal/low) und warum?\n"
        f"- Gibt es eine konkrete Aktion die Slavko unternehmen sollte?\n\n"
        f"Antworte als JSON Array. Fuer jeden Fund:\n"
        f'{{"index": 1, "relevant": true/false, "priority": "high/normal/low", '
        f'"reasoning": "kurze Begruendung", "action_suggestion": "konkrete Aktion oder leer"}}\n\n'
        f"Sei streng. Nur wirklich relevante und actionable Funde durchlassen."
    )

    result = ask_json(prompt, config=config)

    if not result or not isinstance(result, list):
        # Fallback: pass all findings through unchanged
        logger.debug(f"LLM reasoning unavailable for {helferlein_name}, passing all findings through.")
        return findings

    # Merge LLM reasoning back into findings
    enriched = []
    for item in result:
        idx = item.get("index", 0) - 1
        if 0 <= idx < len(findings):
            finding = dict(findings[idx])
            finding["relevant"] = item.get("relevant", True)
            finding["priority"] = item.get("priority", "normal")
            finding["reasoning"] = item.get("reasoning", "")
            finding["action_suggestion"] = item.get("action_suggestion", "")
            enriched.append(finding)

    # Include any findings not covered by LLM response
    covered_indices = {item.get("index", 0) - 1 for item in result}
    for i, f in enumerate(findings):
        if i not in covered_indices:
            enriched.append(f)

    return enriched


def _build_user_context(config: dict) -> str:
    """Build a concise user context string for the reasoning prompt."""
    lines = [
        "- Solo-Unternehmer, klincov.it",
        "- Fokus: Microsoft 365, Power Platform, KI-Beratung",
        "- Projekte: AIBuchhalter (Buchhaltung), Meus (Second Brain), "
        "geofrey (AI Agent), Anomyze (DSGVO), Lael (AI Monitor)",
        "- Markt: DACH, deutsch/englisch",
        "- Sucht: Leads, Kunden, Projektausschreibungen",
    ]

    # Add from profile if available
    try:
        from pathlib import Path
        profile = Path("knowledge-base/context/profile.md")
        if profile.exists():
            content = profile.read_text(encoding="utf-8")[:500]
            lines.append(f"- Profil: {content[:200]}")
    except Exception:
        pass

    return "\n".join(lines)


def _get_recent_rejections(helferlein_name: str) -> str:
    """Get recent rejected proposals to learn from user preferences."""
    try:
        from brain.proposals import get_proposals_by_status
        rejected = get_proposals_by_status("rejected")
        recent = [p for p in rejected if p.helferlein == helferlein_name][:10]
        if not recent:
            return ""

        lines = ["Kuerzlich abgelehnte Vorschlaege (daraus lernen):"]
        for p in recent[:5]:
            comment = f" (Kommentar: {p.user_comment})" if p.user_comment else ""
            lines.append(f"- {p.title}{comment}")
        return "\n".join(lines) + "\n"
    except Exception:
        return ""
