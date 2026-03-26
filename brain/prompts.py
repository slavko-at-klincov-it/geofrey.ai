"""Prompt template loader — loads .md templates with {{VARIABLE}} substitution.

Templates live in brain/templates/ as markdown files. This replaces the old
hardcoded string constants with file-based templates (inspired by gstack pattern).
"""

from pathlib import Path

TEMPLATES_DIR = Path(__file__).parent / "templates"
SKILLS_DIR = Path(__file__).parent / "skills"


def load_template(name: str) -> str:
    """Load a markdown template file by name (without .md extension).

    Searches brain/templates/ first, then brain/skills/.
    Returns raw template string with {{PLACEHOLDERS}} intact.
    """
    for directory in (TEMPLATES_DIR, SKILLS_DIR):
        path = directory / f"{name}.md"
        if path.exists():
            return path.read_text(encoding="utf-8")
    raise FileNotFoundError(f"Template not found: {name}.md (searched {TEMPLATES_DIR}, {SKILLS_DIR})")


def render_template(name: str, **kwargs: str) -> str:
    """Load template and substitute {{VARIABLE}} placeholders with kwargs.

    Unknown placeholders are left as-is. Extra kwargs are ignored.
    Uses str.replace() — no regex, no escaping issues with JSON in templates.
    """
    template = load_template(name)
    for key, value in kwargs.items():
        template = template.replace(f"{{{{{key}}}}}", str(value))
    return template


# Backward-compatible constants — loaded from template files.
# Callers should migrate to render_template() over time.
ORCHESTRATOR_PROMPT = load_template("orchestrator")
CHAT_PROMPT = load_template("chat")
LINKEDIN_PROMPT = load_template("linkedin")
IMAGE_PROMPT_TEMPLATE = load_template("image")
SESSION_EXTRACT_PROMPT = load_template("session-extract")
SESSION_CONSOLIDATE_PROMPT = load_template("session-consolidate")
