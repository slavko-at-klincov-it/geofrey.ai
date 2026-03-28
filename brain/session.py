"""Session manager — manages Claude Code CLI sessions via tmux.

Handles starting, monitoring, capturing output from, and ending
Claude Code sessions running in tmux. Also provides synchronous
execution for simple tasks.

Permission model:
- permission_mode="skip" → --dangerously-skip-permissions (autonomous overnight)
- permission_mode="default" → no permission flag (user approves interactively)
- permission_mode="plan" → --permission-mode plan (read-only analysis)
"""

import logging
import shlex
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from uuid import uuid4

from brain.models import Session, SessionStatus

logger = logging.getLogger("geofrey.session")


def _build_claude_cmd(
    prompt: str | None,
    project_path: str,
    model: str = "opus",
    max_turns: int = 50,

    permission_mode: str = "skip",
) -> str:
    """Build a Claude Code CLI command string.

    Centralizes command construction so all execution paths
    (tmux, sync) use the same logic.

    Args:
        prompt: The prompt to pass via -p. If None, starts in interactive mode
                (used for tmux sessions where /remote-control is sent first).
    """
    parts = ["claude"]

    if permission_mode == "skip":
        parts.append("--dangerously-skip-permissions")
    elif permission_mode != "default":
        parts.append(f"--permission-mode {permission_mode}")

    parts.append(f"--model {model}")
    parts.append(f"--cwd {shlex.quote(project_path)}")

    if prompt is not None:
        parts.append(f"-p {shlex.quote(prompt)}")

    parts.append(f"--max-turns {max_turns}")


    return " ".join(parts)


def _send_keys(tmux_name: str, text: str) -> bool:
    """Send text + Enter to a tmux session."""
    try:
        subprocess.run(
            ["tmux", "send-keys", "-t", tmux_name, text, "Enter"],
            check=True, capture_output=True, text=True,
        )
        return True
    except subprocess.CalledProcessError:
        return False


def _send_prompt_via_buffer(tmux_name: str, prompt: str) -> bool:
    """Send a large prompt to a tmux session via buffer (handles 14K+ chars).

    Uses tmux load-buffer + paste-buffer to avoid character-by-character
    send-keys limitations with large prompts.
    """
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write(prompt)
            tmpfile = f.name

        subprocess.run(
            ["tmux", "load-buffer", "-b", "geofrey-prompt", tmpfile],
            check=True, capture_output=True, text=True,
        )
        subprocess.run(
            ["tmux", "paste-buffer", "-t", tmux_name, "-b", "geofrey-prompt"],
            check=True, capture_output=True, text=True,
        )
        # Submit the prompt
        subprocess.run(
            ["tmux", "send-keys", "-t", tmux_name, "", "Enter"],
            check=True, capture_output=True, text=True,
        )
        return True
    except subprocess.CalledProcessError:
        return False
    finally:
        import os
        try:
            os.unlink(tmpfile)
        except OSError:
            pass


def start_session(
    project_path: str,
    prompt: str,
    model: str = "opus",
    task_id: str | None = None,
    max_turns: int = 50,

    permission_mode: str = "skip",
    remote_control: bool = True,
) -> Session:
    """Start a Claude Code session in a tmux window.

    Creates a new tmux session, sends /remote-control to enable
    app visibility, then sends the prompt.

    Args:
        remote_control: If True, sends /remote-control before the prompt
                        so the session is visible in the Claude app.
    """
    session_id = uuid4().hex[:8]
    tmux_name = f"geofrey-{session_id}"
    resolved_path = str(Path(project_path).expanduser())

    # Validate dependencies before starting
    if not shutil.which("claude"):
        logger.error("claude CLI not found in PATH. Cannot start session.")
        return Session(
            id=session_id, task_id=task_id, project_path=resolved_path,
            model=model, tmux_session=tmux_name, status=SessionStatus.FAILED,
        )
    if not shutil.which("tmux"):
        logger.error("tmux not found. Cannot start background session.")
        return Session(
            id=session_id, task_id=task_id, project_path=resolved_path,
            model=model, tmux_session=tmux_name, status=SessionStatus.FAILED,
        )

    # Start Claude in interactive mode (no -p) so we can send /remote-control first
    claude_cmd = _build_claude_cmd(
        prompt=None,
        project_path=resolved_path,
        model=model,
        max_turns=max_turns,

        permission_mode=permission_mode,
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

    # Wait for Claude Code to initialize
    time.sleep(3)

    # Enable remote control so session is visible in Claude app
    if remote_control:
        _send_keys(tmux_name, "/remote-control")
        time.sleep(2)

    # Send the enriched prompt via tmux buffer (handles 14K+ chars)
    _send_prompt_via_buffer(tmux_name, prompt)

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

    permission_mode: str = "skip",
) -> str:
    """Run Claude Code synchronously (no tmux) and return output.

    For simple tasks that don't need background execution.
    """
    if not shutil.which("claude"):
        logger.error("claude CLI not found in PATH.")
        return ""

    resolved_path = str(Path(project_path).expanduser())

    cmd = _build_claude_cmd(
        prompt=prompt,
        project_path=resolved_path,
        model=model,
        max_turns=max_turns,

        permission_mode=permission_mode,
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
