"""Proactive Questions Queue — geofrey learns about the user over time.

When geofrey is unsure about something, it adds a question to the queue
instead of interrupting the user's flow. The user reviews questions later
via `geofrey questions`.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4

DEFAULT_DB_PATH = str(Path("~/.knowledge/geofrey_tasks.db").expanduser())


def _get_conn(db_path: str | None = None) -> sqlite3.Connection:
    """Get DB connection, create questions table if needed."""
    db_path = db_path or DEFAULT_DB_PATH
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            question TEXT NOT NULL,
            context TEXT DEFAULT '',
            source TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            answer TEXT,
            created_at TEXT,
            answered_at TEXT
        )
    """)
    conn.commit()
    return conn


def add_question(question: str, context: str = "", source: str = "") -> str:
    """Add a question to geofrey's learning queue.

    Returns the question ID.
    """
    qid = uuid4().hex[:8]
    conn = _get_conn()
    conn.execute(
        "INSERT INTO questions (id, question, context, source, created_at) VALUES (?, ?, ?, ?, ?)",
        (qid, question, context, source, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    return qid


def get_pending_questions() -> list[dict]:
    """Get all unanswered questions."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM questions WHERE status = 'pending' ORDER BY created_at ASC"
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def answer_question(question_id: str, answer: str) -> bool:
    """Record user's answer to a question."""
    conn = _get_conn()
    conn.execute(
        "UPDATE questions SET status = 'answered', answer = ?, answered_at = ? WHERE id = ?",
        (answer, datetime.now().isoformat(), question_id),
    )
    conn.commit()
    conn.close()
    return True


def format_questions(questions: list[dict]) -> str:
    """Format pending questions for terminal display."""
    if not questions:
        return "  Keine offenen Fragen. geofrey kennt dich gut genug (vorerst)."

    lines = [f"  geofrey hat {len(questions)} Frage(n) an dich:\n"]
    for i, q in enumerate(questions, 1):
        lines.append(f"  [{q['id']}] {q['question']}")
        if q.get("context"):
            lines.append(f"        Kontext: {q['context'][:100]}")
    lines.append(f"\n  Antworten: geofrey answer <id> \"deine antwort\"")
    return "\n".join(lines)
