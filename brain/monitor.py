"""Session Monitor — active guardian that supervises Claude Code sessions.

Not fire-and-forget. Not passive polling. Active supervision:
1. Polls tmux output on interval
2. Detects Claude asking questions → auto-confirms or asks user
3. GUARDIAN: Detects structural proposals → checks against decisions → warns user
4. Detects scope drift → warns if too many files changed for task scope
5. Detects completion → triggers quality review
6. Returns final output for observer + learning extraction
"""

import logging
import re
import subprocess
import time

from brain.models import SessionStatus
from brain.review import build_review_questions, format_review_prompt
from brain.session import (
    _send_keys,
    _send_prompt_via_buffer,
    capture_session_output,
    get_session_status,
)

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

# Patterns that indicate Claude is proposing structural changes
PROPOSAL_SIGNALS = [
    "I'll move", "I'll restructure", "I'll replace", "I'll remove",
    "I'll delete", "I'll create a new", "I'll refactor", "I'll change the",
    "I'll rename", "I'll migrate", "I'll split", "I'll merge",
    "Let me move", "Let me restructure", "Let me replace", "Let me remove",
    "Let me delete", "Let me create", "Let me refactor", "Let me rename",
    "verschiebe", "ersetze", "entferne", "lösche", "erstelle neu",
    "umstrukturier", "migriere", "ersetzen durch", "umbenenn",
    "switch to", "replace with", "migrate to", "move to",
]

# File operation patterns to extract affected files
FILE_PATTERNS = [
    re.compile(r"(?:Created?|Wrote|Modified|Deleted?|Moved?|Renamed?)\s+(?:file\s+)?['\"]?(\S+\.\w+)", re.IGNORECASE),
    re.compile(r"(?:creating|writing|modifying|deleting|moving|renaming)\s+['\"]?(\S+\.\w+)", re.IGNORECASE),
]


def _build_correction_message(user_response: str, guardian_warning: str) -> str:
    """Wrap user's correction with decision context for Claude.

    The user typed a correction after a guardian warning. We send it to
    Claude in the SAME session, reinforced with the decision context so
    Claude understands WHY the user is correcting.
    """
    # Extract the decision part from the warning
    decision_context = ""
    if "Decision " in guardian_warning:
        decision_start = guardian_warning.find("Decision ")
        decision_context = guardian_warning[decision_start:].strip()

    lines = [
        "[User correction after geofrey guardian warning]",
        "",
        f"The user says: {user_response}",
        "",
    ]
    if decision_context:
        lines.append(f"Reminder: {decision_context}")
        lines.append("")
    lines.append("Please adjust your approach accordingly. Do NOT proceed with the change that was flagged.")

    return "\n".join(lines)


def _get_new_content(output: str, last_checked: str) -> str:
    """Extract only the new content since last poll."""
    if last_checked and len(output) > len(last_checked):
        return output[len(last_checked):]
    return output[-500:] if output else ""


def _detect_confirmation_needed(new_content: str) -> bool:
    """Check if new output contains a confirmation prompt."""
    lower = new_content.lower()
    return any(p.lower() in lower for p in CONFIRMATION_PATTERNS)


def _detect_completion(new_content: str) -> bool:
    """Check if new output indicates task completion."""
    lower = new_content.lower()
    return any(p.lower() in lower for p in COMPLETION_PATTERNS)


def _detect_proposals(new_content: str) -> list[str]:
    """Detect structural change proposals in Claude's output."""
    found = []
    lower = new_content.lower()
    for signal in PROPOSAL_SIGNALS:
        if signal.lower() in lower:
            # Extract the sentence containing the signal
            idx = lower.find(signal.lower())
            start = max(0, new_content.rfind("\n", 0, idx) + 1)
            end = new_content.find("\n", idx)
            if end == -1:
                end = min(len(new_content), idx + 200)
            sentence = new_content[start:end].strip()
            if sentence and sentence not in found:
                found.append(sentence)
    return found


def _extract_affected_files(new_content: str) -> list[str]:
    """Extract file paths mentioned in Claude's output."""
    files = set()
    for pattern in FILE_PATTERNS:
        for match in pattern.finditer(new_content):
            f = match.group(1)
            if not f.startswith("http") and "." in f:
                files.add(f)
    return sorted(files)


def _check_proposals_against_decisions(
    proposals: list[str],
    project_name: str,
    project_path: str,
    config: dict,
) -> list[str]:
    """Check if Claude's proposals conflict with active decisions.

    Returns list of warning strings for the user.
    """
    from knowledge.decisions import load_decisions_from_files

    decisions = load_decisions_from_files(project_name, config)
    active = [d for d in decisions if d.status == "active"]
    if not active:
        return []

    warnings = []
    for proposal in proposals:
        proposal_lower = proposal.lower()
        for dec in active:
            # Check if proposal mentions files in decision's scope
            scope_match = any(s.lower() in proposal_lower for s in dec.scope if s)
            # Check if proposal keywords overlap with decision keywords
            keyword_match = any(kw.lower() in proposal_lower for kw in dec.keywords if kw)

            if scope_match or keyword_match:
                warnings.append(
                    f"⚠ GUARDIAN WARNING: Claude proposes: \"{proposal[:100]}\"\n"
                    f"  Decision {dec.id} ({dec.title}): {dec.change_warning}"
                )
    return warnings


def _check_scope_drift(
    files_changed: list[str],
    original_task: str,
    threshold: int = 4,
) -> str | None:
    """Warn if Claude changed more files than expected for the task scope."""
    if len(files_changed) <= threshold:
        return None
    return (
        f"⚠ SCOPE DRIFT: Claude changed {len(files_changed)} files for task "
        f"\"{original_task[:50]}\". Expected ≤{threshold}. "
        f"Files: {', '.join(files_changed[:5])}"
    )


def monitor_session(
    session_id: str,
    task_type: str,
    task_summary: str,
    project_name: str,
    project_path: str,
    config: dict,
    poll_interval: int = 10,
    auto_confirm: bool = False,
    run_review: bool = True,
    max_wait: int = 3600,
) -> str:
    """Monitor a running tmux session with active guardian supervision.

    Three guardian levels run on every poll:
    1. Proposal Detection → check against decisions → warn user
    2. Scope Drift → count changed files → warn if excessive
    3. Quality Review → send review questions after completion

    Args:
        session_id: tmux session ID (without "geofrey-" prefix)
        task_type: detected task type for review questions
        task_summary: short description of the original task
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
    all_files_changed: set[str] = set()
    warnings_shown: set[str] = set()

    logger.info(f"Guardian monitoring session {session_id} (poll={poll_interval}s)")

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

        new_content = _get_new_content(output, last_output)

        # === GUARDIAN LEVEL 1: Proposal Detection ===
        proposals = _detect_proposals(new_content)
        if proposals:
            decision_warnings = _check_proposals_against_decisions(
                proposals, project_name, project_path, config
            )
            for warning in decision_warnings:
                if warning not in warnings_shown:
                    warnings_shown.add(warning)
                    logger.warning(warning)
                    if not auto_confirm:
                        print(f"\n  {warning}")
                        try:
                            response = input("  [y] continue / [stop] abort / or type correction: ").strip()
                            if response.lower() == "stop":
                                _send_keys(tmux_name, "no")
                                logger.info("User stopped session due to guardian warning")
                                break
                            elif response.lower() == "y":
                                pass  # Let Claude continue
                            elif response:
                                # User typed a correction — wrap with decision context
                                correction = _build_correction_message(response, warning)
                                _send_prompt_via_buffer(tmux_name, correction)
                                logger.info(f"Sent user correction to Claude: {response[:80]}")
                            else:
                                _send_keys(tmux_name, "no")
                        except (EOFError, KeyboardInterrupt):
                            pass
                    else:
                        # Overnight: log warning but continue (mark for briefing)
                        logger.warning(f"AUTO-MODE: Guardian warning logged for briefing")

        # === GUARDIAN LEVEL 2: Track changed files for scope drift ===
        new_files = _extract_affected_files(new_content)
        all_files_changed.update(new_files)

        drift_warning = _check_scope_drift(
            sorted(all_files_changed), task_summary
        )
        if drift_warning and drift_warning not in warnings_shown:
            warnings_shown.add(drift_warning)
            logger.warning(drift_warning)
            if not auto_confirm:
                print(f"\n  {drift_warning}")

        # === Check for confirmation prompts ===
        if _detect_confirmation_needed(new_content):
            if auto_confirm:
                logger.info(f"Auto-confirming in session {session_id}")
                _send_keys(tmux_name, "y")
            else:
                print(f"\n  [Claude asks]: {new_content[-200:].strip()}")
                try:
                    user_response = input("  Your response (Enter for 'y'): ").strip()
                    _send_keys(tmux_name, user_response or "y")
                except (EOFError, KeyboardInterrupt):
                    _send_keys(tmux_name, "y")

        # === Check for completion → Quality Review ===
        if _detect_completion(new_content) and not review_sent and run_review:
            logger.info(f"Completion detected, sending quality review")
            review_sent = True

            questions = build_review_questions(task_type, project_name, project_path, config)
            review_prompt = format_review_prompt(questions)

            if review_prompt:
                logger.info(f"Sending {len(questions)} review questions")
                _send_prompt_via_buffer(tmux_name, review_prompt)

        last_output = output

    # Capture final output
    final_output = capture_session_output(session_id)

    if elapsed >= max_wait:
        logger.warning(f"Session {session_id} timed out after {max_wait}s")

    # Final scope drift check
    if all_files_changed:
        drift = _check_scope_drift(sorted(all_files_changed), task_summary)
        if drift:
            logger.info(drift)

    return final_output or last_output
