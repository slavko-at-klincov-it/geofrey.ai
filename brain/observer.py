"""Session Observer — uses LLM to triage Claude Code session output.

After a Claude Code session completes, the observer analyzes the output
to determine: success/failure, what changed, whether follow-up is needed.
Falls back to basic heuristics if Ollama is unavailable.
"""

import json
import logging
import re
from dataclasses import dataclass, field

import ollama

from brain.prompts import render_template

logger = logging.getLogger("geofrey.observer")


@dataclass
class Observation:
    """Result of observing a Claude Code session output."""
    success: bool = True
    result_summary: str = ""
    follow_up_needed: bool = False
    follow_up_task: str | None = None
    files_changed: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    source: str = "llm"  # "llm" or "heuristic-fallback"


def observe_output(
    session_output: str,
    task_summary: str,
    config: dict,
) -> Observation:
    """Use LLM to analyze Claude Code session output.

    Falls back to heuristic analysis if Ollama is unavailable.
    """
    if not session_output or not session_output.strip():
        return Observation(
            success=False,
            result_summary="No output captured from session.",
            source="heuristic-fallback",
        )

    model = config.get("llm", {}).get("model", "qwen3.5:9b")
    # Truncate output for LLM context window
    truncated = session_output[:4000]

    try:
        prompt = render_template(
            "observe",
            task_summary=task_summary,
            session_output=truncated,
        )
        response = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            think=False,
            options={"temperature": 0.3},
        )
        raw = response["message"]["content"]
        parsed = _parse_observation_json(raw)

        if parsed:
            return Observation(
                success=parsed.get("success", True),
                result_summary=parsed.get("result_summary", ""),
                follow_up_needed=parsed.get("follow_up_needed", False),
                follow_up_task=parsed.get("follow_up_task"),
                files_changed=parsed.get("files_changed", []),
                errors=parsed.get("errors", []),
                source="llm",
            )
    except Exception as e:
        logger.warning(f"Observer LLM failed ({e}), using heuristic fallback.")

    return _heuristic_observation(session_output, task_summary)


def _parse_observation_json(text: str) -> dict:
    """Parse JSON from LLM response with fallbacks."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return {}


def _heuristic_observation(session_output: str, task_summary: str) -> Observation:
    """Basic heuristic analysis when LLM is unavailable."""
    output_lower = session_output.lower()

    # Detect errors
    error_patterns = ["error:", "traceback", "failed", "exception", "abort"]
    errors = [p for p in error_patterns if p in output_lower]

    # Detect success patterns
    success_patterns = ["completed", "done", "fixed", "created", "updated", "passed"]
    successes = [p for p in success_patterns if p in output_lower]

    success = len(successes) > len(errors)

    # Detect changed files
    files = re.findall(r"(?:created|modified|wrote|updated)\s+(?:file\s+)?['\"]?([^\s'\"]+\.\w+)", output_lower)

    return Observation(
        success=success,
        result_summary=f"{'Completed' if success else 'Failed'}: {task_summary}",
        files_changed=files[:10],
        errors=errors,
        source="heuristic-fallback",
    )
