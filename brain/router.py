"""Task router — detects task type and selects appropriate skill template.

Inspired by gstack's 28-skill architecture, scaled to 6 task types
appropriate for a 9B model. Uses keyword matching (DE + EN) for instant,
deterministic routing.
"""

from dataclasses import dataclass
from pathlib import Path

from brain.prompts import load_template, SKILLS_DIR

# Keyword-based routing (DE + EN)
TASK_KEYWORDS: dict[str, list[str]] = {
    "code-fix": [
        "fix", "bug", "error", "crash", "broken", "failing", "debug", "issue",
        "problem", "fehler", "kaputt", "reparier", "beheb",
    ],
    "feature": [
        "add", "implement", "create", "build", "new feature", "erstell", "bau",
        "hinzufüg", "neu", "develop", "make",
    ],
    "review": [
        "review", "check", "pr", "pull request", "code quality", "prüf",
        "überprüf", "anschau", "bewert",
    ],
    "research": [
        "research", "find", "search", "explain", "what is", "how does",
        "recherch", "such", "erklär", "was ist", "wie funktioniert",
    ],
    "security": [
        "security", "audit", "dsgvo", "gdpr", "nis2", "vulnerability",
        "sicherheit", "datenschutz", "compliance",
    ],
    "refactor": [
        "refactor", "cleanup", "clean up", "simplify", "restructure",
        "extract", "rename", "aufräum", "vereinfach", "umstrukturier",
    ],
    "doc-sync": [
        "doc", "docs", "documentation", "sync", "update docs", "document",
        "changelog", "readme", "journal", "doku", "dokumentation",
        "aktualisier", "sync docs", "doc-sync", "release notes",
    ],
}

DEFAULT_SKILL = "code-fix"


def detect_task_type(user_input: str) -> str:
    """Detect task type from user input using keyword matching.

    Returns skill name (e.g., 'code-fix', 'feature', 'review').
    Falls back to DEFAULT_SKILL if no keywords match.
    """
    input_lower = user_input.lower()
    scores: dict[str, int] = {}

    for skill, keywords in TASK_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in input_lower)
        if score > 0:
            scores[skill] = score

    if not scores:
        return DEFAULT_SKILL

    return max(scores, key=scores.get)


def get_skill_template(skill_name: str) -> str:
    """Load skill template. Falls back to orchestrator template if not found."""
    path = SKILLS_DIR / f"{skill_name}.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return load_template("orchestrator")


def list_skills() -> list[str]:
    """List all available skill names."""
    return [f.stem for f in sorted(SKILLS_DIR.glob("*.md"))]


# Hardcoded fallback defaults if config has no skill_defaults section
_SKILL_FALLBACKS: dict[str, dict] = {
    "code-fix": {"model_category": "code", "max_budget_usd": 5.0, "max_turns": 30, "permission_mode": "default", "needs_plan": False},
    "feature": {"model_category": "code", "max_budget_usd": 10.0, "max_turns": 50, "permission_mode": "default", "needs_plan": True},
    "refactor": {"model_category": "code", "max_budget_usd": 10.0, "max_turns": 50, "permission_mode": "default", "needs_plan": True},
    "review": {"model_category": "analysis", "max_budget_usd": 2.0, "max_turns": 15, "permission_mode": "plan", "needs_plan": False},
    "research": {"model_category": "analysis", "max_budget_usd": 5.0, "max_turns": 20, "permission_mode": "plan", "needs_plan": False},
    "security": {"model_category": "analysis", "max_budget_usd": 5.0, "max_turns": 20, "permission_mode": "plan", "needs_plan": False},
    "doc-sync": {"model_category": "content", "max_budget_usd": 3.0, "max_turns": 30, "permission_mode": "default", "needs_plan": False},
}


@dataclass
class SkillMeta:
    """Metadata for a skill — drives command construction in Python."""

    name: str
    model_category: str
    needs_plan: bool
    max_budget_usd: float
    max_turns: int
    permission_mode: str


def get_skill_meta(skill_name: str, config: dict) -> SkillMeta:
    """Load skill metadata from config, falling back to hardcoded defaults."""
    cfg_defaults = config.get("skill_defaults", {})
    skill_cfg = cfg_defaults.get(skill_name, {})
    fallback = _SKILL_FALLBACKS.get(skill_name, _SKILL_FALLBACKS["code-fix"])

    return SkillMeta(
        name=skill_name,
        model_category=skill_cfg.get("model_category", fallback["model_category"]),
        needs_plan=skill_cfg.get("needs_plan", fallback["needs_plan"]),
        max_budget_usd=skill_cfg.get("max_budget_usd", fallback["max_budget_usd"]),
        max_turns=skill_cfg.get("max_turns", fallback["max_turns"]),
        permission_mode=skill_cfg.get("permission_mode", fallback.get("permission_mode", "default")),
    )
