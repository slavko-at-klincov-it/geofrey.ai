"""Task queue — SQLite-backed persistent queue for geofrey tasks.

Manages tasks that geofrey can execute autonomously (overnight batch,
background work). Tasks go through: pending -> running -> done/failed/needs_input.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from brain.models import AgentType, Task, TaskPriority, TaskStatus
from brain.orchestrator import load_projects

DEFAULT_DB_PATH = str(Path("~/.knowledge/geofrey_tasks.db").expanduser())


def init_db(db_path: str | None = None) -> str:
    """Create the SQLite database and tasks table if they don't exist.

    Returns the database path used.
    """
    db_path = db_path or DEFAULT_DB_PATH
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            agent_type TEXT DEFAULT 'coder',
            status TEXT DEFAULT 'pending',
            priority INTEGER DEFAULT 2,
            project TEXT,
            project_path TEXT,
            created_at TEXT,
            started_at TEXT,
            completed_at TEXT,
            result TEXT,
            error TEXT,
            questions TEXT,
            depends_on TEXT
        )
    """)
    conn.commit()
    conn.close()
    return db_path


def _get_conn(db_path: str | None = None) -> sqlite3.Connection:
    """Get a database connection with Row factory enabled.

    Auto-initializes the database if the table doesn't exist.
    """
    db_path = db_path or DEFAULT_DB_PATH
    init_db(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_task(row: sqlite3.Row) -> Task:
    """Convert a database row to a Task dataclass.

    Deserializes JSON fields and maps string values to enums.
    """
    questions = json.loads(row["questions"]) if row["questions"] else []
    depends_on = json.loads(row["depends_on"]) if row["depends_on"] else []

    return Task(
        id=row["id"],
        description=row["description"],
        agent_type=AgentType(row["agent_type"]),
        status=TaskStatus(row["status"]),
        priority=TaskPriority(row["priority"]),
        project=row["project"],
        project_path=row["project_path"],
        created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else datetime.now(),
        started_at=datetime.fromisoformat(row["started_at"]) if row["started_at"] else None,
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
        result=row["result"],
        error=row["error"],
        questions=questions,
        depends_on=depends_on,
    )


def add_task(
    description: str,
    project: str | None = None,
    agent_type: str = "coder",
    priority: int = 2,
    depends_on: list[str] | None = None,
    db_path: str | None = None,
) -> Task:
    """Add a new task to the queue.

    Resolves the project path from projects.yaml if a project name is given.
    Returns the created Task.
    """
    task_id = uuid4().hex[:12]
    now = datetime.now().isoformat()

    # Resolve project path
    project_path = None
    if project:
        projects = load_projects()
        if project in projects:
            project_path = projects[project].get("path")

    conn = _get_conn(db_path)
    conn.execute(
        """INSERT INTO tasks
           (id, description, agent_type, status, priority, project, project_path,
            created_at, questions, depends_on)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            task_id,
            description,
            agent_type,
            TaskStatus.PENDING.value,
            priority,
            project,
            project_path,
            now,
            json.dumps(depends_on or []),
            json.dumps(depends_on or []),
        ),
    )
    conn.commit()
    conn.close()

    return Task(
        id=task_id,
        description=description,
        agent_type=AgentType(agent_type),
        status=TaskStatus.PENDING,
        priority=TaskPriority(priority),
        project=project,
        project_path=project_path,
        created_at=datetime.fromisoformat(now),
        questions=[],
        depends_on=depends_on or [],
    )


def get_task(task_id: str, db_path: str | None = None) -> Task | None:
    """Retrieve a single task by ID. Returns None if not found."""
    conn = _get_conn(db_path)
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    if row is None:
        return None
    return _row_to_task(row)


def get_pending_tasks(db_path: str | None = None) -> list[Task]:
    """Get all pending tasks, ordered by priority (highest first), then creation time."""
    conn = _get_conn(db_path)
    rows = conn.execute(
        "SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at ASC",
        (TaskStatus.PENDING.value,),
    ).fetchall()
    conn.close()
    return [_row_to_task(row) for row in rows]


def get_tasks_by_status(status: str, db_path: str | None = None) -> list[Task]:
    """Get all tasks matching the given status string."""
    conn = _get_conn(db_path)
    rows = conn.execute(
        "SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC",
        (status,),
    ).fetchall()
    conn.close()
    return [_row_to_task(row) for row in rows]


def update_task(task_id: str, db_path: str | None = None, **kwargs) -> Task:
    """Update fields on a task.

    Automatically sets started_at when status changes to RUNNING,
    and completed_at when status changes to DONE or FAILED.
    Returns the updated Task.
    """
    conn = _get_conn(db_path)

    # Handle automatic timestamps on status transitions
    if "status" in kwargs:
        status_val = kwargs["status"]
        if isinstance(status_val, TaskStatus):
            status_val = status_val.value
            kwargs["status"] = status_val
        if status_val == TaskStatus.RUNNING.value:
            kwargs.setdefault("started_at", datetime.now().isoformat())
        elif status_val in (TaskStatus.DONE.value, TaskStatus.FAILED.value):
            kwargs.setdefault("completed_at", datetime.now().isoformat())

    # Serialize list fields
    for list_field in ("questions", "depends_on"):
        if list_field in kwargs and isinstance(kwargs[list_field], list):
            kwargs[list_field] = json.dumps(kwargs[list_field])

    # Build SET clause
    set_parts = [f"{key} = ?" for key in kwargs]
    values = list(kwargs.values()) + [task_id]

    conn.execute(
        f"UPDATE tasks SET {', '.join(set_parts)} WHERE id = ?",
        values,
    )
    conn.commit()

    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()

    return _row_to_task(row)


def get_overnight_summary(db_path: str | None = None) -> dict:
    """Get a summary of all tasks grouped by status.

    Returns a dict with counts and task lists per status category.
    """
    conn = _get_conn(db_path)
    rows = conn.execute("SELECT * FROM tasks ORDER BY created_at DESC").fetchall()
    conn.close()

    summary: dict = {
        "done": 0,
        "failed": 0,
        "needs_input": 0,
        "pending": 0,
        "running": 0,
        "tasks_done": [],
        "tasks_failed": [],
        "tasks_needs_input": [],
        "tasks_pending": [],
        "tasks_running": [],
    }

    for row in rows:
        task = _row_to_task(row)
        status = task.status.value
        if status in summary:
            summary[status] += 1
            summary[f"tasks_{status}"].append(task)

    return summary
