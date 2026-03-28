"""LLM Intent Layer — understands what the user actually wants.

Sits between user input and the deterministic enrichment pipeline.
Uses Qwen3.5-9B via Ollama to understand natural language intent,
resolve ambiguity, detect follow-ups, and decompose multi-step tasks.

Falls back to keyword-based routing (router.py) if Ollama is unavailable.
"""

import json
import logging
from dataclasses import dataclass, field

import ollama

from brain.prompts import render_template
from brain.router import detect_task_type as keyword_detect

logger = logging.getLogger("geofrey.intent")


@dataclass
class Intent:
    """Structured understanding of what the user wants."""
    task_type: str = "code-fix"
    project: str | None = None
    summary: str = ""
    clarification: str | None = None
    subtasks: list[str] = field(default_factory=list)
    relevant_files: list[str] = field(default_factory=list)
    approach: str | None = None
    task_brief: str = ""              # LLM-composed task description for Claude Code
    source: str = "llm"  # "llm" or "keyword-fallback"


def _format_projects(projects: dict) -> str:
    """Format project registry for the LLM prompt."""
    if not projects:
        return "(no projects registered)"
    lines = []
    for name, info in projects.items():
        lines.append(f"- {name}: {info.get('description', '')} ({info.get('stack', '')})")
    return "\n".join(lines)


def _parse_intent_json(text: str) -> dict:
    """Parse JSON from LLM response with fallbacks."""
    import re
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try extracting from code fence
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # Try finding first { ... }
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return {}


def understand_intent(
    user_input: str,
    config: dict,
    conversation_history: list[str] | None = None,
) -> Intent:
    """Use LLM to understand user intent. Falls back to keyword routing.

    Args:
        user_input: Raw user input text.
        config: Config dict with llm model settings.
        conversation_history: Recent conversation turns for follow-up detection.

    Returns:
        Intent dataclass with structured understanding.
    """
    # Build context (lazy import to avoid circular dependency)
    from brain.orchestrator import load_projects
    projects = load_projects()
    projects_text = _format_projects(projects)

    context_text = ""
    if conversation_history:
        recent = conversation_history[-5:]  # Last 5 turns
        context_text = "RECENT CONVERSATION:\n" + "\n".join(f"- {turn}" for turn in recent)

    # Build prompt
    prompt = render_template(
        "intent",
        projects=projects_text,
        user_input=user_input,
        conversation_context=context_text,
    )

    # Call LLM
    model = config.get("llm", {}).get("model", "qwen3.5:9b")
    try:
        response = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            think=False,
            options={"temperature": 0.3},
        )
        raw = response["message"]["content"]
        parsed = _parse_intent_json(raw)

        if not parsed or "task_type" not in parsed:
            logger.warning("LLM returned unparseable intent, falling back to keywords.")
            return _keyword_fallback(user_input)

        # Validate task_type
        valid_types = {"code-fix", "feature", "refactor", "review", "research", "security", "doc-sync"}
        task_type = parsed.get("task_type", "code-fix")
        if task_type not in valid_types:
            task_type = "code-fix"

        return Intent(
            task_type=task_type,
            project=parsed.get("project"),
            summary=parsed.get("summary", user_input),
            clarification=parsed.get("clarification"),
            subtasks=parsed.get("subtasks", []),
            relevant_files=parsed.get("relevant_files", []),
            approach=parsed.get("approach"),
            task_brief=parsed.get("task_brief", ""),
            source="llm",
        )

    except Exception as e:
        logger.warning(f"LLM intent failed ({e}), falling back to keywords.")
        return _keyword_fallback(user_input)


def _keyword_fallback(user_input: str) -> Intent:
    """Fall back to keyword-based routing when LLM is unavailable."""
    from brain.orchestrator import detect_project  # lazy import

    task_type = keyword_detect(user_input)
    project_name, _ = detect_project(user_input)

    return Intent(
        task_type=task_type,
        project=project_name,
        summary=user_input,
        source="keyword-fallback",
    )
