"""Session manager — manages Claude Code CLI sessions via tmux.

Handles starting, monitoring, capturing output from, and ending
Claude Code sessions running in tmux. Also provides synchronous
execution for simple tasks.
"""

import shlex
import subprocess
from pathlib import Path
from uuid import uuid4

from brain.models import Session, SessionStatus


def start_session(
    project_path: str,
    prompt: str,
    model: str = "opus",
    task_id: str | None = None,
    max_turns: int = 50,
    max_budget_usd: float = 10.0,
) -> Session:
    """Start a Claude Code session in a tmux window.

    Creates a new tmux session and runs Claude Code inside it.
    Returns a Session object with status RUNNING.
    """
    session_id = uuid4().hex[:8]
    tmux_name = f"geofrey-{session_id}"
    resolved_path = str(Path(project_path).expanduser())

    claude_cmd = (
        f"claude --dangerously-skip-permissions"
        f" --model {model}"
        f" --cwd {shlex.quote(resolved_path)}"
        f" -p {shlex.quote(prompt)}"
        f" --max-turns {max_turns}"
        f" --max-budget-usd {max_budget_usd:.2f}"
    )

    try:
        subprocess.run(
            ["tmux", "new-session", "-d", "-s", tmux_name, claude_cmd],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError:
        return Session(
            id=session_id,
            task_id=task_id,
            project_path=resolved_path,
            model=model,
            tmux_session=tmux_name,
            status=SessionStatus.FAILED,
        )

    return Session(
        id=session_id,
        task_id=task_id,
        project_path=resolved_path,
        model=model,
        tmux_session=tmux_name,
        status=SessionStatus.RUNNING,
    )


def get_session_status(session_id: str) -> SessionStatus:
    """Check whether a tmux session is still running.

    Returns RUNNING if the tmux session exists, COMPLETED otherwise.
    """
    tmux_name = f"geofrey-{session_id}"
    result = subprocess.run(
        ["tmux", "has-session", "-t", tmux_name],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return SessionStatus.RUNNING
    return SessionStatus.COMPLETED


def capture_session_output(session_id: str) -> str:
    """Capture current output from a tmux session pane.

    Returns the last 200 lines of the tmux pane content.
    """
    tmux_name = f"geofrey-{session_id}"
    try:
        result = subprocess.run(
            ["tmux", "capture-pane", "-t", tmux_name, "-p", "-S", "-200"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout
    except subprocess.CalledProcessError:
        return ""


def end_session(session_id: str) -> str:
    """End a session: capture final output, then kill the tmux session.

    Returns the captured output before killing.
    """
    output = capture_session_output(session_id)

    tmux_name = f"geofrey-{session_id}"
    subprocess.run(
        ["tmux", "kill-session", "-t", tmux_name],
        capture_output=True,
        text=True,
    )

    return output


def list_sessions() -> list[str]:
    """List all active geofrey tmux sessions.

    Returns a list of session IDs (without the 'geofrey-' prefix).
    """
    try:
        result = subprocess.run(
            ["tmux", "list-sessions", "-F", "#{session_name}"],
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError:
        return []

    prefix = "geofrey-"
    session_ids = []
    for line in result.stdout.strip().splitlines():
        if line.startswith(prefix):
            session_ids.append(line[len(prefix):])
    return session_ids


def run_session_sync(
    project_path: str,
    prompt: str,
    model: str = "opus",
    max_turns: int = 50,
    max_budget_usd: float = 10.0,
) -> str:
    """Run Claude Code synchronously (no tmux) and return output.

    For simple tasks that don't need background execution.
    """
    resolved_path = str(Path(project_path).expanduser())

    cmd = (
        f"claude --dangerously-skip-permissions"
        f" --model {model}"
        f" --cwd {shlex.quote(resolved_path)}"
        f" -p {shlex.quote(prompt)}"
        f" --max-turns {max_turns}"
        f" --max-budget-usd {max_budget_usd:.2f}"
    )

    try:
        result = subprocess.run(
            ["bash", "-c", cmd],
            capture_output=True,
            text=True,
        )
        return result.stdout
    except Exception:
        return ""
