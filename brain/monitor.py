"""Session Monitor — polls tmux sessions, handles confirmations, triggers quality review.

Replaces fire-and-forget execution with active supervision:
1. Polls capture_session_output() on interval
2. Detects Claude asking questions → auto-confirms or asks user
3. Detects session completion → triggers quality review
4. Sends review questions to SAME Claude session
5. Returns final output for observer + learning extraction
"""

import logging
import time

from brain.review import build_review_questions, format_review_prompt
from brain.session import (
    _send_keys,
    _send_prompt_via_buffer,
    capture_session_output,
    get_session_status,
)
from brain.models import SessionStatus

logger = logging.getLogger("geofrey.monitor")


# Patterns that indicate Claude is asking for confirmation
CONFIRMATION_PATTERNS = [
    "Execute? [y/N]",
    "execute? [y/n]",
    "[y/N]:",
    "[Y/n]:",
    "Should I proceed?",
    "Do you want me to",
    "Shall I continue",
    "Continue?",
    "Proceed?",
]

# Patterns that indicate Claude has finished
COMPLETION_PATTERNS = [
    "Task completed",
    "All done",
    "Changes committed",
    "I've completed",
    "I have completed",
    "The fix has been",
    "Done!",
    "Finished!",
]


def _detect_confirmation_needed(output: str, last_checked: str) -> bool:
    """Check if new output contains a confirmation prompt."""
    # Only check new content since last poll
    new_content = output[len(last_checked):] if last_checked and output.startswith(last_checked[:50]) else output[-500:]
    return any(pattern.lower() in new_content.lower() for pattern in CONFIRMATION_PATTERNS)


def _detect_completion(output: str, last_checked: str) -> bool:
    """Check if new output indicates task completion."""
    new_content = output[len(last_checked):] if last_checked and output.startswith(last_checked[:50]) else output[-500:]
    return any(pattern.lower() in new_content.lower() for pattern in COMPLETION_PATTERNS)


def monitor_session(
    session_id: str,
    task_type: str,
    project_name: str,
    project_path: str,
    config: dict,
    poll_interval: int = 10,
    auto_confirm: bool = False,
    run_review: bool = True,
    max_wait: int = 600,
) -> str:
    """Monitor a running tmux session with active supervision.

    Args:
        session_id: tmux session ID (without "geofrey-" prefix)
        task_type: detected task type for review questions
        project_name: project name for decision/learning queries
        project_path: project path for git operations
        config: geofrey config dict
        poll_interval: seconds between output polls
        auto_confirm: if True, auto-send "y" to confirmations (overnight mode)
        run_review: if True, send quality review questions after completion
        max_wait: maximum seconds to wait before timeout

    Returns:
        Final captured session output.
    """
    tmux_name = f"geofrey-{session_id}"
    last_output = ""
    elapsed = 0
    review_sent = False

    logger.info(f"Monitoring session {session_id} (poll={poll_interval}s, auto_confirm={auto_confirm})")

    while elapsed < max_wait:
        time.sleep(poll_interval)
        elapsed += poll_interval

        # Check if session is still alive
        status = get_session_status(session_id)
        if status == SessionStatus.COMPLETED:
            logger.info(f"Session {session_id} completed after {elapsed}s")
            break

        # Capture current output
        output = capture_session_output(session_id)
        if not output or output == last_output:
            continue

        # Check for confirmation prompts
        if _detect_confirmation_needed(output, last_output):
            if auto_confirm:
                logger.info(f"Auto-confirming in session {session_id}")
                _send_keys(tmux_name, "y")
            else:
                # Show what Claude is asking and get user input
                new_lines = output[len(last_output):].strip() if last_output else output[-300:].strip()
                print(f"\n  [Claude asks]: {new_lines[-200:]}")
                try:
                    user_response = input("  Your response (Enter for 'y'): ").strip()
                    _send_keys(tmux_name, user_response or "y")
                except (EOFError, KeyboardInterrupt):
                    _send_keys(tmux_name, "y")

        # Check for completion (even if session still alive — Claude might be waiting)
        if _detect_completion(output, last_output) and not review_sent and run_review:
            logger.info(f"Completion detected in session {session_id}, sending quality review")
            review_sent = True

            # Build and send review questions
            questions = build_review_questions(task_type, project_name, project_path, config)
            review_prompt = format_review_prompt(questions)

            if review_prompt:
                logger.info(f"Sending {len(questions)} review questions")
                _send_prompt_via_buffer(tmux_name, review_prompt)
                # Don't break — wait for Claude to answer the review

        last_output = output

    # Capture final output
    final_output = capture_session_output(session_id)

    if elapsed >= max_wait:
        logger.warning(f"Session {session_id} timed out after {max_wait}s")

    return final_output or last_output
