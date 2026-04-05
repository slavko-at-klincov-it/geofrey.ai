"""Proposal system -- helferlein create proposals, user approves via dashboard.

Extends geofrey's existing SQLite database with a proposals table.
Proposals are the core of the helferlein system: each helferlein
researches/crawls/checks overnight and creates proposals. The user
reviews them in the morning dashboard and approves or rejects.

Approved proposals with a prepared_prompt get executed via Claude Code CLI.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from brain.models import (
    Proposal,
    ProposalActionType,
    ProposalStatus,
)
from brain.queue import DEFAULT_DB_PATH, _get_conn

# Re-use the same DB as the task queue


def init_proposals_table(db_path: str | None = None) -> None:
    """Create the proposals table if it doesn't exist."""
    db_path = db_path or DEFAULT_DB_PATH
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path, timeout=5.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS proposals (
            id TEXT PRIMARY KEY,
            helferlein TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            priority TEXT DEFAULT 'normal',
            action_type TEXT DEFAULT 'notify',
            evidence TEXT DEFAULT '[]',
            prepared_prompt TEXT DEFAULT '',
            prepared_plan TEXT DEFAULT '',
            project TEXT,
            project_path TEXT,
            status TEXT DEFAULT 'pending',
            user_comment TEXT,
            session_id TEXT,
            created_at TEXT,
            executed_at TEXT,
            completed_at TEXT,
            result TEXT,
            error TEXT
        )
    """)
    conn.commit()
    conn.close()


def _get_proposals_conn(db_path: str | None = None) -> sqlite3.Connection:
    """Get a connection with proposals table initialized."""
    db_path = db_path or DEFAULT_DB_PATH
    init_proposals_table(db_path)
    conn = sqlite3.connect(db_path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_proposal(row: sqlite3.Row) -> Proposal:
    """Convert a database row to a Proposal dataclass."""
    evidence = json.loads(row["evidence"]) if row["evidence"] else []

    return Proposal(
        id=row["id"],
        helferlein=row["helferlein"],
        title=row["title"],
        description=row["description"],
        priority=row["priority"] or "normal",
        action_type=ProposalActionType(row["action_type"]) if row["action_type"] else ProposalActionType.NOTIFY,
        evidence=evidence,
        prepared_prompt=row["prepared_prompt"] or "",
        prepared_plan=row["prepared_plan"] or "",
        project=row["project"],
        project_path=row["project_path"],
        status=ProposalStatus(row["status"]) if row["status"] else ProposalStatus.PENDING,
        user_comment=row["user_comment"],
        session_id=row["session_id"],
        created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else datetime.now(),
        executed_at=datetime.fromisoformat(row["executed_at"]) if row["executed_at"] else None,
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
        result=row["result"],
        error=row["error"],
    )


def create_proposal(
    helferlein: str,
    title: str,
    description: str,
    priority: str = "normal",
    action_type: str = "notify",
    evidence: list[str] | None = None,
    prepared_prompt: str = "",
    prepared_plan: str = "",
    project: str | None = None,
    project_path: str | None = None,
    db_path: str | None = None,
) -> Proposal:
    """Create a new proposal from a helferlein.

    Returns the created Proposal.
    """
    proposal_id = f"P-{datetime.now().strftime('%Y%m%d')}-{uuid4().hex[:6]}"
    now = datetime.now().isoformat()

    conn = _get_proposals_conn(db_path)
    conn.execute(
        """INSERT INTO proposals
           (id, helferlein, title, description, priority, action_type,
            evidence, prepared_prompt, prepared_plan, project, project_path,
            status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            proposal_id,
            helferlein,
            title,
            description,
            priority,
            action_type,
            json.dumps(evidence or []),
            prepared_prompt,
            prepared_plan,
            project,
            project_path,
            ProposalStatus.PENDING.value,
            now,
        ),
    )
    conn.commit()
    conn.close()

    return Proposal(
        id=proposal_id,
        helferlein=helferlein,
        title=title,
        description=description,
        priority=priority,
        action_type=ProposalActionType(action_type),
        evidence=evidence or [],
        prepared_prompt=prepared_prompt,
        prepared_plan=prepared_plan,
        project=project,
        project_path=project_path,
        status=ProposalStatus.PENDING,
        created_at=datetime.fromisoformat(now),
    )


def get_proposal(proposal_id: str, db_path: str | None = None) -> Proposal | None:
    """Retrieve a single proposal by ID."""
    conn = _get_proposals_conn(db_path)
    row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
    conn.close()
    if row is None:
        return None
    return _row_to_proposal(row)


def get_pending_proposals(db_path: str | None = None) -> list[Proposal]:
    """Get all pending proposals, ordered by priority (high first) then date."""
    priority_order = {"high": 3, "normal": 2, "low": 1}
    conn = _get_proposals_conn(db_path)
    rows = conn.execute(
        "SELECT * FROM proposals WHERE status = ? ORDER BY created_at DESC",
        (ProposalStatus.PENDING.value,),
    ).fetchall()
    conn.close()

    proposals = [_row_to_proposal(row) for row in rows]
    proposals.sort(key=lambda p: priority_order.get(p.priority, 2), reverse=True)
    return proposals


def get_proposals_by_status(status: str, db_path: str | None = None) -> list[Proposal]:
    """Get proposals by status string."""
    conn = _get_proposals_conn(db_path)
    rows = conn.execute(
        "SELECT * FROM proposals WHERE status = ? ORDER BY created_at DESC",
        (status,),
    ).fetchall()
    conn.close()
    return [_row_to_proposal(row) for row in rows]


def get_recent_proposals(
    limit: int = 50,
    db_path: str | None = None,
) -> list[Proposal]:
    """Get recent proposals across all statuses."""
    conn = _get_proposals_conn(db_path)
    rows = conn.execute(
        "SELECT * FROM proposals ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [_row_to_proposal(row) for row in rows]


def approve_proposal(
    proposal_id: str,
    comment: str | None = None,
    db_path: str | None = None,
) -> Proposal | None:
    """Approve a proposal. Sets status to APPROVED.

    The executor picks up approved proposals and runs them.
    """
    conn = _get_proposals_conn(db_path)
    row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
    if row is None:
        conn.close()
        return None

    updates = {"status": ProposalStatus.APPROVED.value}
    if comment:
        updates["user_comment"] = comment

    set_parts = [f"{k} = ?" for k in updates]
    values = list(updates.values()) + [proposal_id]
    conn.execute(f"UPDATE proposals SET {', '.join(set_parts)} WHERE id = ?", values)
    conn.commit()

    row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
    conn.close()
    return _row_to_proposal(row)


def reject_proposal(
    proposal_id: str,
    comment: str | None = None,
    db_path: str | None = None,
) -> Proposal | None:
    """Reject a proposal."""
    conn = _get_proposals_conn(db_path)
    row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
    if row is None:
        conn.close()
        return None

    updates = {
        "status": ProposalStatus.REJECTED.value,
        "completed_at": datetime.now().isoformat(),
    }
    if comment:
        updates["user_comment"] = comment

    set_parts = [f"{k} = ?" for k in updates]
    values = list(updates.values()) + [proposal_id]
    conn.execute(f"UPDATE proposals SET {', '.join(set_parts)} WHERE id = ?", values)
    conn.commit()

    row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
    conn.close()
    return _row_to_proposal(row)


def update_proposal(proposal_id: str, db_path: str | None = None, **kwargs) -> Proposal | None:
    """Update fields on a proposal.

    Handles automatic timestamps on status transitions.
    """
    conn = _get_proposals_conn(db_path)

    # Auto-timestamps
    if "status" in kwargs:
        status_val = kwargs["status"]
        if isinstance(status_val, ProposalStatus):
            status_val = status_val.value
            kwargs["status"] = status_val
        if status_val == ProposalStatus.EXECUTING.value:
            kwargs.setdefault("executed_at", datetime.now().isoformat())
        elif status_val in (ProposalStatus.DONE.value, ProposalStatus.FAILED.value):
            kwargs.setdefault("completed_at", datetime.now().isoformat())

    # Serialize lists
    if "evidence" in kwargs and isinstance(kwargs["evidence"], list):
        kwargs["evidence"] = json.dumps(kwargs["evidence"])

    set_parts = [f"{key} = ?" for key in kwargs]
    values = list(kwargs.values()) + [proposal_id]

    conn.execute(f"UPDATE proposals SET {', '.join(set_parts)} WHERE id = ?", values)
    conn.commit()

    row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
    conn.close()

    if row is None:
        return None
    return _row_to_proposal(row)


def has_pending_proposal(helferlein: str, title_contains: str, db_path: str | None = None) -> bool:
    """Check if a pending/approved/executing proposal with similar title exists.

    Used by helferlein to avoid creating duplicate proposals.
    """
    conn = _get_proposals_conn(db_path)
    rows = conn.execute(
        "SELECT id FROM proposals WHERE helferlein = ? AND status IN (?, ?, ?) AND title LIKE ?",
        (helferlein, "pending", "approved", "executing", f"%{title_contains}%"),
    ).fetchall()
    conn.close()
    return len(rows) > 0


def get_proposal_summary(db_path: str | None = None) -> dict:
    """Get counts per status for the dashboard header."""
    conn = _get_proposals_conn(db_path)
    rows = conn.execute(
        "SELECT status, COUNT(*) as cnt FROM proposals GROUP BY status"
    ).fetchall()
    conn.close()

    summary = {s.value: 0 for s in ProposalStatus}
    for row in rows:
        summary[row["status"]] = row["cnt"]
    return summary
