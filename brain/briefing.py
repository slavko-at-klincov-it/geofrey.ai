"""Morning Briefing — generates a summary of overnight task processing.

Queries the task queue for completed/changed tasks since last briefing,
groups them into categories, and formats a readable terminal display.
Also saves JSON for UI consumption.
"""

import json
from datetime import datetime
from pathlib import Path

from brain.models import BriefingItem, MorningBriefing, TaskStatus
from brain.queue import get_overnight_summary, mark_briefing_shown
from knowledge.store import load_config

# Paths
KNOWLEDGE_DIR = Path.home() / ".knowledge"
BRIEFING_MD_PATH = KNOWLEDGE_DIR / "briefing.md"
BRIEFING_JSON_PATH = KNOWLEDGE_DIR / "briefing.json"


def generate_briefing(config: dict | None = None) -> MorningBriefing:
    """Generate a morning briefing from overnight task results.

    Queries the task queue for all tasks completed/changed since the
    last briefing and groups them into categories.

    Args:
        config: Config dict. Loaded from config.yaml if None.

    Returns:
        MorningBriefing with categorized items.
    """
    config = config or load_config()
    summary = get_overnight_summary()

    briefing = MorningBriefing(generated_at=datetime.now())

    # Collect all tasks from the correct summary keys
    all_tasks = (
        summary.get("tasks_done", [])
        + summary.get("tasks_failed", [])
        + summary.get("tasks_needs_input", [])
    )

    for task in all_tasks:
        if task.status == TaskStatus.DONE:
            result = task.result or ""
            has_code_changes = any(
                kw in result.lower()
                for kw in ["created file", "modified", "commit", "wrote", "changed"]
            ) if result else False

            item = BriefingItem(
                category="done",
                title=task.description,
                details=result[:300] if result else "Completed.",
                task_id=task.id,
            )
            briefing.done.append(item)

            if has_code_changes:
                approval_item = BriefingItem(
                    category="approval",
                    title=task.description,
                    details=result[:300] if result else "Code changes to review.",
                    task_id=task.id,
                    actions=["annehmen", "ablehnen"],
                )
                briefing.needs_approval.append(approval_item)

        elif task.status == TaskStatus.NEEDS_INPUT:
            questions = task.questions or []
            item = BriefingItem(
                category="input",
                title=task.description,
                details="\n".join(f"  \u2192 {q}" for q in questions) if questions else "Needs input.",
                task_id=task.id,
            )
            briefing.needs_input.append(item)

        elif task.status == TaskStatus.FAILED:
            item = BriefingItem(
                category="done",
                title=f"[FAILED] {task.description}",
                details=(task.error or "Unknown error")[:300],
                task_id=task.id,
            )
            briefing.done.append(item)

    # Build project status from task list
    project_counts: dict[str, dict[str, int]] = {}
    for task in all_tasks:
        pname = task.project or "unknown"
        if pname not in project_counts:
            project_counts[pname] = {"done": 0, "failed": 0, "needs_input": 0}
        if task.status == TaskStatus.DONE:
            project_counts[pname]["done"] += 1
        elif task.status == TaskStatus.FAILED:
            project_counts[pname]["failed"] += 1
        elif task.status == TaskStatus.NEEDS_INPUT:
            project_counts[pname]["needs_input"] += 1

    for pname, counts in project_counts.items():
        parts = []
        if counts["done"]:
            parts.append(f"{counts['done']} erledigt")
        if counts["failed"]:
            parts.append(f"{counts['failed']} fehlgeschlagen")
        if counts["needs_input"]:
            parts.append(f"{counts['needs_input']} braucht Input")
        if parts:
            briefing.project_status.append(BriefingItem(
                category="status", title=pname, details=", ".join(parts),
            ))

    return briefing


def format_briefing(briefing: MorningBriefing) -> str:
    """Format a MorningBriefing as readable terminal text.

    Skips empty categories. Uses box-drawing characters for visual
    separation.

    Args:
        briefing: The MorningBriefing to format.

    Returns:
        Formatted string ready for terminal display.
    """
    date_str = briefing.generated_at.strftime("%A, %d. %B %Y — %H:%M")
    border = "\u2550" * 52

    lines = [
        "",
        border,
        "  geofrey — Morning Briefing",
        f"  {date_str}",
        border,
        "",
    ]

    has_content = False

    if briefing.done:
        has_content = True
        lines.append("\u2705 Erledigt:")
        for item in briefing.done:
            detail = f" — {item.details}" if item.details else ""
            lines.append(f"  - {item.title}{detail}")
        lines.append("")

    if briefing.needs_approval:
        has_content = True
        lines.append("\U0001f4cb Zur Freigabe:")
        for item in briefing.needs_approval:
            detail = f" — {item.details}" if item.details else ""
            actions = " [" + " / ".join(item.actions) + "]" if item.actions else ""
            lines.append(f"  - {item.title}{detail}{actions}")
        lines.append("")

    if briefing.needs_input:
        has_content = True
        lines.append("\u2753 Brauche Input:")
        for item in briefing.needs_input:
            lines.append(f"  - {item.title}")
            if item.details:
                for detail_line in item.details.strip().split("\n"):
                    lines.append(f"    {detail_line}")
        lines.append("")

    if briefing.project_status:
        has_content = True
        lines.append("\U0001f4ca Projekt-Status:")
        for item in briefing.project_status:
            lines.append(f"  - {item.title}: {item.details}")
        lines.append("")

    if not has_content:
        lines.append("  Keine Aktivität seit dem letzten Briefing.")
        lines.append("")

    lines.append(border)
    lines.append("")

    return "\n".join(lines)


def save_briefing(briefing: MorningBriefing, path: str | None = None) -> None:
    """Save briefing to markdown and JSON files.

    Saves formatted text to briefing.md and structured JSON to
    briefing.json for UI consumption.

    Args:
        briefing: The MorningBriefing to save.
        path: Override path for the markdown file. Defaults to
              ~/.knowledge/briefing.md.
    """
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)

    md_path = Path(path) if path else BRIEFING_MD_PATH
    formatted = format_briefing(briefing)
    md_path.write_text(formatted, encoding="utf-8")

    # JSON for UI consumption
    json_data = {
        "generated_at": briefing.generated_at.isoformat(),
        "done": [_item_to_dict(item) for item in briefing.done],
        "needs_approval": [_item_to_dict(item) for item in briefing.needs_approval],
        "needs_input": [_item_to_dict(item) for item in briefing.needs_input],
        "project_status": [_item_to_dict(item) for item in briefing.project_status],
    }
    BRIEFING_JSON_PATH.write_text(
        json.dumps(json_data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _item_to_dict(item: BriefingItem) -> dict:
    """Convert a BriefingItem to a JSON-serializable dict."""
    return {
        "category": item.category,
        "title": item.title,
        "details": item.details,
        "task_id": item.task_id,
        "actions": item.actions,
    }


def show_briefing() -> None:
    """Load and print the latest morning briefing to the terminal.

    Marks the briefing as shown so the next summary only includes
    new tasks. If no briefing file exists, prints a helpful message.
    """
    if not BRIEFING_MD_PATH.exists():
        print("No briefing available. Run overnight processing first.")
        return

    content = BRIEFING_MD_PATH.read_text(encoding="utf-8")
    print(content)

    mark_briefing_shown()
