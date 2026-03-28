"""Overnight Research Agent — searches the web for relevant news via Claude Code Sonnet.

Reads interests from config/interests.yaml, generates search queries,
runs Claude Code with --model sonnet for web research, saves findings.
"""

import logging
from datetime import datetime
from pathlib import Path

import yaml

from brain.session import run_session_sync

logger = logging.getLogger("geofrey.researcher")

INTERESTS_PATH = Path(__file__).parent.parent / "config" / "interests.yaml"
RESEARCH_DIR = Path(__file__).parent.parent / "knowledge-base" / "research"


def load_interests() -> list[dict]:
    """Load research interests from config/interests.yaml."""
    if not INTERESTS_PATH.exists():
        return []
    with open(INTERESTS_PATH) as f:
        data = yaml.safe_load(f) or {}
    return data.get("interests", [])


def add_interest(topic: str, keywords: list[str] | None = None, priority: str = "normal") -> None:
    """Add a new interest to the config."""
    interests = load_interests()
    interests.append({
        "topic": topic,
        "keywords": keywords or [topic],
        "priority": priority,
    })
    with open(INTERESTS_PATH, "w") as f:
        yaml.dump({"interests": interests}, f, default_flow_style=False, allow_unicode=True)


def _build_research_prompt(interest: dict) -> str:
    """Build a research prompt for Claude Code Sonnet."""
    keywords = ", ".join(interest.get("keywords", [interest["topic"]]))
    return (
        f"Research the latest news, updates, and developments about: {interest['topic']}.\n"
        f"Search keywords: {keywords}\n\n"
        f"Focus on:\n"
        f"- News from the last 7 days\n"
        f"- Relevant for a DACH-based AI & Automation consultant\n"
        f"- Practical implications, not just announcements\n\n"
        f"Output a brief summary (3-5 bullet points) of the most important findings. "
        f"Include sources/URLs where possible."
    )


def run_overnight_research(config: dict, max_topics: int = 5) -> list[dict]:
    """Run research for all configured interests using Claude Code Sonnet.

    Called by the overnight daemon before task processing.

    Returns list of {topic, findings} dicts.
    """
    interests = load_interests()
    if not interests:
        logger.info("No research interests configured.")
        return []

    # Sort by priority (high first), limit
    priority_order = {"high": 0, "normal": 1, "low": 2}
    interests.sort(key=lambda x: priority_order.get(x.get("priority", "normal"), 1))
    interests = interests[:max_topics]

    logger.info(f"Researching {len(interests)} topics...")
    results = []

    for interest in interests:
        topic = interest["topic"]
        logger.info(f"  Researching: {topic}")

        prompt = _build_research_prompt(interest)

        try:
            output = run_session_sync(
                project_path=str(Path.home()),
                prompt=prompt,
                model="sonnet",
                max_turns=20,
                permission_mode="plan",  # Read-only, no file changes
            )

            if output and output.strip():
                results.append({
                    "topic": topic,
                    "priority": interest.get("priority", "normal"),
                    "findings": output.strip(),
                })
                logger.info(f"  Found {len(output)} chars for {topic}")
            else:
                logger.info(f"  No findings for {topic}")

        except Exception as e:
            logger.warning(f"  Research failed for {topic}: {e}")

    # Save findings
    if results:
        _save_findings(results)

    return results


def _save_findings(results: list[dict]) -> Path:
    """Save research findings as markdown."""
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    filepath = RESEARCH_DIR / f"{date}.md"

    lines = [
        f"# Research Findings — {date}",
        "",
    ]
    for r in results:
        lines.append(f"## {r['topic']} [{r['priority']}]")
        lines.append("")
        lines.append(r["findings"])
        lines.append("")

    filepath.write_text("\n".join(lines), encoding="utf-8")
    logger.info(f"Saved research findings to {filepath}")
    return filepath


def format_interests(interests: list[dict]) -> str:
    """Format interests for terminal display."""
    if not interests:
        return "  Keine Interessen konfiguriert. Nutze: geofrey interests add \"Thema\""

    lines = ["  geofrey's Overnight-Research Themen:\n"]
    for i, interest in enumerate(interests, 1):
        priority = interest.get("priority", "normal")
        icon = "🔴" if priority == "high" else "🟡" if priority == "normal" else "⚪"
        keywords = ", ".join(interest.get("keywords", [])[:3])
        lines.append(f"  {icon} {interest['topic']}")
        lines.append(f"     Keywords: {keywords}")
    lines.append(f"\n  Hinzufügen: geofrey interests add \"Neues Thema\"")
    return "\n".join(lines)
