"""Overnight daemon — processes queued tasks and generates morning briefing.

Runs as a macOS launchd job at 02:00. Processes pending tasks from the
SQLite queue, executes them via the agent system, and generates a morning
briefing with results.
"""

import logging
import sys
from datetime import datetime
from pathlib import Path

from brain.briefing import generate_briefing, save_briefing
from brain.command import resolve_model
from brain.enricher import enrich_prompt
from brain.gates import has_blockers, validate_prompt
from brain.models import TaskStatus
from brain.queue import get_pending_tasks, update_task
from brain.router import detect_task_type, get_skill_meta
from knowledge.store import load_config

# Paths
KNOWLEDGE_DIR = Path.home() / ".knowledge"
LOG_PATH = KNOWLEDGE_DIR / "geofrey.log"

logger = logging.getLogger("geofrey.daemon")


def _setup_logging() -> None:
    """Configure file+console logging for daemon runs."""
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_PATH, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def process_queue(config: dict | None = None, max_tasks: int = 10) -> list[dict]:
    """Process pending tasks from the queue.

    Iterates over pending tasks ordered by priority, executes each via
    the agent pipeline (detect type -> skill meta -> model -> enrich -> run),
    and updates task status with results.

    Robust: one failed task does not stop the loop.

    Args:
        config: Config dict. Loaded from config.yaml if None.
        max_tasks: Maximum number of tasks to process in this run.

    Returns:
        List of processed task summaries with id, status, and result_preview.
    """
    from brain.agents import run_agent

    config = config or load_config()
    pending = get_pending_tasks(max_tasks=max_tasks)
    results: list[dict] = []

    if not pending:
        logger.info("No pending tasks in queue.")
        return results

    logger.info(f"Processing {len(pending)} pending task(s)...")

    for task in pending:
        task_summary = {"id": task.id, "status": "skipped", "result_preview": ""}

        try:
            # Check dependencies — skip if depends_on tasks aren't done
            if task.depends_on:
                from brain.queue import get_task

                deps_met = True
                for dep_id in task.depends_on:
                    dep_task = get_task(dep_id)
                    if dep_task is None or dep_task.status != TaskStatus.DONE:
                        deps_met = False
                        break

                if not deps_met:
                    logger.info(f"Task {task.id[:8]} skipped — dependencies not met.")
                    task_summary["status"] = "skipped"
                    task_summary["result_preview"] = "Dependencies not met"
                    results.append(task_summary)
                    continue

            # Mark as running
            update_task(task.id, status=TaskStatus.RUNNING)
            logger.info(f"Running task {task.id[:8]}: {task.description[:60]}")

            # Detect task type and get skill metadata
            task_type = detect_task_type(task.description)
            skill_meta = get_skill_meta(task_type, config)
            model = resolve_model(skill_meta.model_category, config)

            # Resolve project path
            project_path = task.project_path or str(Path.cwd())
            project_name = task.project or Path(project_path).name

            # Enrich prompt with context
            enriched = enrich_prompt(
                user_input=task.description,
                project_name=project_name,
                project_path=project_path,
                task_type=task_type,
                config=config,
            )

            # Safety gate — validate prompt before execution
            issues = validate_prompt(enriched.enriched_prompt)
            if has_blockers(issues):
                raise ValueError(f"Safety gate blocked: {issues}")
            if issues:
                logger.warning(f"Task {task.id[:8]} safety warnings: {issues}")

            # Run the agent with model/turns/budget/permissions via config
            agent_config = dict(config)
            agent_config["model"] = model
            agent_config["max_turns"] = skill_meta.max_turns
            agent_config["permission_mode"] = skill_meta.permission_mode

            agent_result = run_agent(
                task=task,
                enriched_prompt=enriched,
                config=agent_config,
            )

            # Handle result
            if agent_result.get("questions"):
                update_task(
                    task.id,
                    status=TaskStatus.NEEDS_INPUT,
                    questions=agent_result["questions"],
                )
                task_summary["status"] = "needs_input"
                task_summary["result_preview"] = f"Questions: {agent_result['questions'][0]}"
                logger.info(f"Task {task.id[:8]} needs input — {len(agent_result['questions'])} question(s).")
            else:
                result_text = agent_result.get("result", "Completed without output.")
                update_task(
                    task.id,
                    status=TaskStatus.DONE,
                    result=result_text,
                )
                task_summary["status"] = "done"
                task_summary["result_preview"] = result_text[:200]
                logger.info(f"Task {task.id[:8]} done.")

        except Exception as e:
            error_msg = f"{type(e).__name__}: {e}"
            logger.error(f"Task {task.id[:8]} failed: {error_msg}")

            try:
                update_task(
                    task.id,
                    status=TaskStatus.FAILED,
                    error=error_msg,
                )
            except Exception:
                logger.error(f"Could not update failed status for task {task.id[:8]}.")

            task_summary["status"] = "failed"
            task_summary["result_preview"] = error_msg[:200]

        results.append(task_summary)

    logger.info(f"Processed {len(results)} task(s).")
    return results


def run_overnight(config: dict | None = None) -> None:
    """Run the full overnight cycle: process queue + generate briefing.

    Called by the launchd scheduler or manually via CLI.
    Logs start/end time and results to ~/.knowledge/geofrey.log.

    Args:
        config: Config dict. Loaded from config.yaml if None.
    """
    _setup_logging()
    config = config or load_config()

    start_time = datetime.now()
    logger.info(f"=== Overnight run started at {start_time.strftime('%Y-%m-%d %H:%M:%S')} ===")

    # Pre-flight checks
    from brain.preflight import run_preflight, format_preflight
    checks = run_preflight(config)
    logger.info(format_preflight(checks))

    if not checks["claude"][0]:
        logger.error("ABORT: claude CLI not in PATH. Cannot execute tasks.")
        return
    if not checks["directories"][0]:
        logger.error(f"ABORT: {checks['directories'][1]}")
        return
    if not checks["ollama_running"][0]:
        logger.warning(f"Ollama not running — session intelligence will be skipped.")
    if not checks["tmux"][0]:
        logger.warning("tmux not found — sessions will use sync mode.")

    # Process the task queue
    results = process_queue(config=config)

    # Generate and save morning briefing
    try:
        briefing = generate_briefing(config=config)
        save_briefing(briefing)
        logger.info("Morning briefing generated and saved.")
    except Exception as e:
        logger.error(f"Failed to generate briefing: {e}")

    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    done_count = sum(1 for r in results if r["status"] == "done")
    failed_count = sum(1 for r in results if r["status"] == "failed")

    logger.info(
        f"=== Overnight run finished at {end_time.strftime('%Y-%m-%d %H:%M:%S')} "
        f"({duration:.1f}s) — {done_count} done, {failed_count} failed ==="
    )


def get_launchd_plist() -> str:
    """Return macOS launchd plist XML for the overnight daemon.

    Label: ai.geofrey.overnight
    Schedule: 02:00 every night
    The user installs this manually into ~/Library/LaunchAgents/.

    Includes EnvironmentVariables so launchd has correct PATH (for claude,
    ollama, git), HOME, and USER — without these, the daemon runs in a
    minimal environment where most tools are not in PATH.

    Returns:
        The plist XML content as a string.
    """
    import os as _os
    project_root = Path(__file__).parent.parent.resolve()
    log_path = KNOWLEDGE_DIR / "geofrey-overnight.log"
    user = _os.environ.get("USER", "nobody")
    home = str(Path.home())

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.geofrey.overnight</string>

    <key>UserName</key>
    <string>{user}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>{home}</string>
        <key>USER</key>
        <string>{user}</string>
    </dict>

    <key>ProgramArguments</key>
    <array>
        <string>python3</string>
        <string>{project_root / "brain" / "daemon.py"}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>{project_root}</string>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>{log_path}</string>

    <key>StandardErrorPath</key>
    <string>{log_path}</string>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>"""


if __name__ == "__main__":
    run_overnight()
