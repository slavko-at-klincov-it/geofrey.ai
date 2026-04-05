"""Proposal executor -- runs approved proposals via Claude Code CLI.

When a user approves a proposal in the dashboard, the executor:
1. Takes the prepared_prompt from the proposal
2. Starts a Claude Code CLI session via tmux (user can watch)
3. Tracks execution status and captures results

Uses the existing session.py infrastructure for tmux management.
"""

import logging
from pathlib import Path

from brain.models import ProposalActionType, ProposalStatus
from brain.proposals import get_proposal, get_proposals_by_status, update_proposal
from brain.session import (
    capture_session_output,
    get_session_status,
    start_session,
)
from brain.models import SessionStatus

logger = logging.getLogger("geofrey.executor")


def execute_proposal(
    proposal_id: str,
    model: str = "sonnet",
    max_turns: int = 200,
    permission_mode: str = "default",
    db_path: str | None = None,
) -> bool:
    """Execute an approved proposal by starting a Claude Code CLI session.

    The session runs in tmux so the user can watch it in a terminal.
    Permission mode defaults to "default" (user approves interactively),
    NOT "skip", because the user explicitly wants control.

    Returns True if session started successfully.
    """
    proposal = get_proposal(proposal_id, db_path=db_path)
    if proposal is None:
        logger.error(f"Proposal {proposal_id} not found.")
        return False

    if proposal.status != ProposalStatus.APPROVED:
        logger.error(f"Proposal {proposal_id} is {proposal.status.value}, not approved.")
        return False

    if not proposal.prepared_prompt:
        logger.error(f"Proposal {proposal_id} has no prepared_prompt.")
        # Still mark as done for notify-type proposals
        if proposal.action_type == ProposalActionType.NOTIFY:
            update_proposal(
                proposal_id,
                status=ProposalStatus.DONE,
                result="Notification acknowledged.",
                db_path=db_path,
            )
            return True
        return False

    # Resolve project path
    project_path = proposal.project_path or str(Path.cwd())
    if proposal.project and not proposal.project_path:
        try:
            from brain.orchestrator import load_projects
            projects = load_projects()
            if proposal.project in projects:
                project_path = str(Path(projects[proposal.project]["path"]).expanduser())
        except Exception:
            pass

    # Build the full prompt including user comment if provided
    prompt = proposal.prepared_prompt
    if proposal.user_comment:
        prompt = (
            f"{prompt}\n\n"
            f"--- User-Kommentar ---\n"
            f"{proposal.user_comment}\n"
            f"Bitte beachte diesen Kommentar bei der Umsetzung."
        )

    # Mark as executing
    update_proposal(
        proposal_id,
        status=ProposalStatus.EXECUTING,
        db_path=db_path,
    )

    # Start Claude Code session in tmux
    session = start_session(
        project_path=project_path,
        prompt=prompt,
        model=model,
        max_turns=max_turns,
        permission_mode=permission_mode,
        remote_control=True,
    )

    if session.status == SessionStatus.FAILED:
        update_proposal(
            proposal_id,
            status=ProposalStatus.FAILED,
            error="Failed to start Claude Code session.",
            db_path=db_path,
        )
        logger.error(f"Proposal {proposal_id}: session failed to start.")
        return False

    # Store session ID for status tracking
    update_proposal(
        proposal_id,
        session_id=session.id,
        db_path=db_path,
    )

    logger.info(
        f"Proposal {proposal_id} executing in tmux session geofrey-{session.id}"
    )
    return True


def check_executing_proposals(db_path: str | None = None) -> list[dict]:
    """Check status of all executing proposals.

    Called periodically (or on dashboard refresh) to update
    proposals whose Claude Code sessions have finished.

    Returns list of proposals that changed status.
    """
    executing = get_proposals_by_status(ProposalStatus.EXECUTING.value, db_path=db_path)
    changed = []

    for proposal in executing:
        if not proposal.session_id:
            update_proposal(
                proposal.id,
                status=ProposalStatus.FAILED,
                error="No session ID tracked.",
                db_path=db_path,
            )
            changed.append({"id": proposal.id, "new_status": "failed"})
            continue

        session_status = get_session_status(proposal.session_id)

        if session_status == SessionStatus.COMPLETED:
            # Capture final output
            output = capture_session_output(proposal.session_id)
            result_preview = output[-500:] if output else "Session completed."

            update_proposal(
                proposal.id,
                status=ProposalStatus.DONE,
                result=result_preview,
                db_path=db_path,
            )
            changed.append({"id": proposal.id, "new_status": "done"})
            logger.info(f"Proposal {proposal.id} completed.")

    return changed
