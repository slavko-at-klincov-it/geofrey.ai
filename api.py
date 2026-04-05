#!/usr/bin/env python3
"""geofrey Web API -- FastAPI backend for dashboard + chat."""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uvicorn

from brain.proposals import (
    approve_proposal,
    create_proposal,
    get_pending_proposals,
    get_proposal,
    get_proposal_summary,
    get_recent_proposals,
    reject_proposal,
    update_proposal,
)
from brain.executor import check_executing_proposals, execute_proposal
from brain.models import ProposalStatus


app = FastAPI(title="geofrey", docs_url=None, openapi_url=None)

# Serve UI files
ui_dir = Path(__file__).parent / "ui"
if ui_dir.exists():
    app.mount("/static", StaticFiles(directory=ui_dir), name="static")


# --- Pydantic Models ---

class ProposalApproveRequest(BaseModel):
    """Approve request with optional comment."""
    comment: Optional[str] = None
    model: str = "sonnet"
    permission_mode: str = "default"


class ProposalRejectRequest(BaseModel):
    """Reject request with optional comment."""
    comment: Optional[str] = None


class ProposalCommentRequest(BaseModel):
    """Add a comment to a proposal."""
    comment: str


class QueueAddRequest(BaseModel):
    """Add a task to the queue."""
    description: str
    project: Optional[str] = None
    priority: str = "normal"
    agent: str = "coder"


# --- Dashboard ---

@app.get("/")
async def root():
    """Serve the dashboard."""
    dashboard = ui_dir / "dashboard.html"
    if dashboard.exists():
        return FileResponse(dashboard, media_type="text/html")
    index = ui_dir / "index.html"
    if index.exists():
        return FileResponse(index, media_type="text/html")
    return {"message": "geofrey dashboard"}


# --- Proposal Endpoints ---

@app.get("/api/proposals")
async def list_proposals(status: Optional[str] = None, limit: int = 50):
    """List proposals, optionally filtered by status."""
    # Update executing proposals first
    check_executing_proposals()

    if status:
        from brain.proposals import get_proposals_by_status
        proposals = get_proposals_by_status(status)
    else:
        proposals = get_recent_proposals(limit=limit)

    return {
        "proposals": [_proposal_to_dict(p) for p in proposals],
        "summary": get_proposal_summary(),
    }


@app.get("/api/proposals/pending")
async def list_pending_proposals():
    """Get pending proposals for the dashboard."""
    check_executing_proposals()
    proposals = get_pending_proposals()
    return {
        "proposals": [_proposal_to_dict(p) for p in proposals],
        "summary": get_proposal_summary(),
    }


@app.get("/api/proposals/{proposal_id}")
async def get_proposal_detail(proposal_id: str):
    """Get a single proposal with full details."""
    proposal = get_proposal(proposal_id)
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return _proposal_to_dict(proposal)


@app.post("/api/proposals/{proposal_id}/approve")
async def approve_proposal_endpoint(proposal_id: str, request: ProposalApproveRequest):
    """Approve a proposal and start execution.

    If the proposal has a prepared_prompt, a Claude Code CLI session
    is started in tmux. The user can watch it in a terminal.
    """
    proposal = approve_proposal(proposal_id, comment=request.comment)
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")

    # Execute if there's a prepared prompt
    executed = False
    if proposal.prepared_prompt:
        executed = execute_proposal(
            proposal_id,
            model=request.model,
            permission_mode=request.permission_mode,
        )

    return {
        "proposal": _proposal_to_dict(get_proposal(proposal_id)),
        "executed": executed,
    }


@app.post("/api/proposals/{proposal_id}/reject")
async def reject_proposal_endpoint(proposal_id: str, request: ProposalRejectRequest):
    """Reject a proposal."""
    proposal = reject_proposal(proposal_id, comment=request.comment)
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return _proposal_to_dict(proposal)


@app.post("/api/proposals/{proposal_id}/comment")
async def comment_proposal_endpoint(proposal_id: str, request: ProposalCommentRequest):
    """Add a comment to a proposal without changing status."""
    proposal = update_proposal(proposal_id, user_comment=request.comment)
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return _proposal_to_dict(proposal)


# --- Task Queue Endpoints ---

@app.get("/api/queue")
async def list_queue(status: Optional[str] = None):
    """List task queue."""
    from brain.queue import get_tasks_by_status, get_pending_tasks
    if status:
        tasks = get_tasks_by_status(status)
    else:
        tasks = get_pending_tasks()
    return {
        "tasks": [
            {
                "id": t.id,
                "description": t.description,
                "status": t.status.value,
                "priority": t.priority.name,
                "project": t.project,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in tasks
        ],
    }


@app.post("/api/queue")
async def add_to_queue(request: QueueAddRequest):
    """Add a task to the queue."""
    from brain.queue import add_task
    priority_map = {"high": 3, "normal": 2, "low": 1}
    task = add_task(
        description=request.description,
        project=request.project,
        priority=priority_map.get(request.priority, 2),
        agent_type=request.agent,
    )
    return {"id": task.id, "status": task.status.value}


# --- System Status ---

@app.get("/api/status")
async def status():
    """System status check."""
    import shutil
    summary = get_proposal_summary()
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "claude_available": shutil.which("claude") is not None,
        "tmux_available": shutil.which("tmux") is not None,
        "proposals": summary,
    }


@app.get("/api/briefing")
async def briefing():
    """Get the latest morning briefing."""
    briefing_json = Path.home() / ".knowledge" / "briefing.json"
    if briefing_json.exists():
        return json.loads(briefing_json.read_text(encoding="utf-8"))
    return {"message": "No briefing available yet."}


# --- Helpers ---

def _proposal_to_dict(p) -> dict:
    """Convert a Proposal to a JSON-serializable dict."""
    return {
        "id": p.id,
        "helferlein": p.helferlein,
        "title": p.title,
        "description": p.description,
        "priority": p.priority,
        "action_type": p.action_type.value if hasattr(p.action_type, "value") else p.action_type,
        "evidence": p.evidence,
        "prepared_prompt": p.prepared_prompt,
        "prepared_plan": p.prepared_plan,
        "project": p.project,
        "status": p.status.value if hasattr(p.status, "value") else p.status,
        "user_comment": p.user_comment,
        "session_id": p.session_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "executed_at": p.executed_at.isoformat() if p.executed_at else None,
        "completed_at": p.completed_at.isoformat() if p.completed_at else None,
        "result": p.result,
        "error": p.error,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
