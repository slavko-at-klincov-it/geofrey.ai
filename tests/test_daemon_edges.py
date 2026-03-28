"""Edge case tests for brain/daemon.py process_queue and run_overnight.

Covers: circular dependencies, safety gate blocking, agent questions,
agent exceptions, empty queue, max_tasks limit, dependency met,
mixed results, and run_overnight orchestration.

Run with: .venv/bin/python -m pytest tests/test_daemon_edges.py -v
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from brain.models import EnrichedPrompt, Task, TaskPriority, TaskStatus


def _make_task(
    task_id: str = "aaa111",
    description: str = "test task",
    depends_on: list[str] | None = None,
    status: TaskStatus = TaskStatus.PENDING,
    project_path: str | None = None,
) -> Task:
    """Helper to create a Task with sensible defaults."""
    return Task(
        id=task_id,
        description=description,
        status=status,
        project_path=project_path or "/tmp/test",
        depends_on=depends_on or [],
    )


def _make_enriched(original: str = "test task") -> EnrichedPrompt:
    """Helper to create an EnrichedPrompt stub."""
    return EnrichedPrompt(
        original_input=original,
        enriched_prompt=f"Enriched: {original}",
        task_type="code-fix",
    )


# Default config used across tests
_CONFIG = {"model_policy": {"code": "opus"}}


class TestDaemonEdgeCases:
    """Edge case tests for daemon.process_queue."""

    # --- 1. Circular dependencies ---

    def test_circular_dependencies_both_skipped(self):
        """Task A depends on B, Task B depends on A. Both should be skipped."""
        from brain.daemon import process_queue

        task_a = _make_task(task_id="aaa111", description="Task A", depends_on=["bbb222"])
        task_b = _make_task(task_id="bbb222", description="Task B", depends_on=["aaa111"])

        # get_task returns the other task (still PENDING, not DONE)
        def mock_get_task(task_id):
            lookup = {"aaa111": task_a, "bbb222": task_b}
            return lookup.get(task_id)

        with patch("brain.daemon.get_pending_tasks", return_value=[task_a, task_b]), \
             patch("brain.daemon.update_task") as mock_update, \
             patch("brain.queue.get_task", side_effect=mock_get_task), \
             patch("brain.daemon.load_config", return_value=_CONFIG):

            results = process_queue(config=_CONFIG)

        assert len(results) == 2
        assert results[0]["status"] == "skipped"
        assert results[0]["result_preview"] == "Dependencies not met"
        assert results[1]["status"] == "skipped"
        assert results[1]["result_preview"] == "Dependencies not met"
        # update_task should NOT have been called (tasks were skipped before RUNNING)
        mock_update.assert_not_called()

    # --- 2. Safety gate blocking ---

    def test_safety_gate_blocks_task(self):
        """Task whose enriched prompt triggers has_blockers=True is marked FAILED."""
        from brain.daemon import process_queue

        task = _make_task(description="deploy with AWS_SECRET_KEY=xxx")
        updated_calls = {}

        def mock_update(task_id, **kwargs):
            updated_calls[task_id] = updated_calls.get(task_id, [])
            updated_calls[task_id].append(kwargs)
            return task

        with patch("brain.daemon.get_pending_tasks", return_value=[task]), \
             patch("brain.daemon.update_task", side_effect=mock_update), \
             patch("brain.daemon.enrich_prompt", return_value=_make_enriched()), \
             patch("brain.daemon.validate_prompt", return_value=["SECRET_KEY detected"]), \
             patch("brain.daemon.has_blockers", return_value=True), \
             patch("brain.agents.base.run_session_sync", return_value="nope"):

            results = process_queue(config=_CONFIG)

        assert len(results) == 1
        assert results[0]["status"] == "failed"
        assert "Safety gate blocked" in results[0]["result_preview"]
        # Task should have been set to RUNNING then FAILED
        fail_call = updated_calls[task.id][-1]
        assert fail_call["status"] == TaskStatus.FAILED

    # --- 3. Agent returns questions ---

    def test_agent_returns_questions_marks_needs_input(self):
        """Agent result with questions marks the task as NEEDS_INPUT."""
        from brain.daemon import process_queue

        task = _make_task(description="refactor auth module")
        updated_calls = {}

        def mock_update(task_id, **kwargs):
            updated_calls[task_id] = updated_calls.get(task_id, [])
            updated_calls[task_id].append(kwargs)
            return task

        agent_result = {"result": "", "questions": ["Which env?"]}

        with patch("brain.daemon.get_pending_tasks", return_value=[task]), \
             patch("brain.daemon.update_task", side_effect=mock_update), \
             patch("brain.daemon.enrich_prompt", return_value=_make_enriched()), \
             patch("brain.daemon.validate_prompt", return_value=[]), \
             patch("brain.daemon.has_blockers", return_value=False), \
             patch("brain.agents.run_agent", return_value=agent_result):

            results = process_queue(config=_CONFIG)

        assert len(results) == 1
        assert results[0]["status"] == "needs_input"
        assert "Which env?" in results[0]["result_preview"]
        # Last update should set NEEDS_INPUT
        last_update = updated_calls[task.id][-1]
        assert last_update["status"] == TaskStatus.NEEDS_INPUT

    # --- 4. Agent raises exception ---

    def test_agent_raises_exception_marks_failed(self):
        """RuntimeError from run_agent marks task as FAILED."""
        from brain.daemon import process_queue

        task = _make_task(description="crash task")
        updated_calls = {}

        def mock_update(task_id, **kwargs):
            updated_calls[task_id] = updated_calls.get(task_id, [])
            updated_calls[task_id].append(kwargs)
            return task

        with patch("brain.daemon.get_pending_tasks", return_value=[task]), \
             patch("brain.daemon.update_task", side_effect=mock_update), \
             patch("brain.daemon.enrich_prompt", return_value=_make_enriched()), \
             patch("brain.daemon.validate_prompt", return_value=[]), \
             patch("brain.daemon.has_blockers", return_value=False), \
             patch("brain.agents.run_agent", side_effect=RuntimeError("tmux crashed")):

            results = process_queue(config=_CONFIG)

        assert len(results) == 1
        assert results[0]["status"] == "failed"
        assert "RuntimeError" in results[0]["result_preview"]
        assert "tmux crashed" in results[0]["result_preview"]
        # FAILED status should be set in update_task
        fail_call = updated_calls[task.id][-1]
        assert fail_call["status"] == TaskStatus.FAILED

    # --- 5. Empty queue ---

    def test_empty_queue_returns_empty_list(self):
        """No pending tasks returns empty result list."""
        from brain.daemon import process_queue

        with patch("brain.daemon.get_pending_tasks", return_value=[]):
            results = process_queue(config=_CONFIG)

        assert results == []

    # --- 6. max_tasks limit ---

    def test_max_tasks_limits_processing(self):
        """5 tasks queued but max_tasks=2, only 2 processed."""
        from brain.daemon import process_queue

        tasks = [_make_task(task_id=f"task{i:04d}", description=f"Task {i}") for i in range(5)]

        agent_result = {"result": "done", "questions": []}

        with patch("brain.daemon.get_pending_tasks", return_value=tasks[:2]) as mock_get, \
             patch("brain.daemon.update_task", return_value=tasks[0]), \
             patch("brain.daemon.enrich_prompt", return_value=_make_enriched()), \
             patch("brain.daemon.validate_prompt", return_value=[]), \
             patch("brain.daemon.has_blockers", return_value=False), \
             patch("brain.agents.run_agent", return_value=agent_result):

            results = process_queue(config=_CONFIG, max_tasks=2)

        # get_pending_tasks is called with max_tasks=2
        mock_get.assert_called_once_with(max_tasks=2)
        assert len(results) == 2

    # --- 7. Dependency met ---

    def test_dependency_met_proceeds(self):
        """Task B depends on Task A which is DONE. Task B should proceed."""
        from brain.daemon import process_queue

        task_a = _make_task(task_id="aaa111", description="Task A", status=TaskStatus.DONE)
        task_b = _make_task(task_id="bbb222", description="Task B", depends_on=["aaa111"])

        agent_result = {"result": "B completed", "questions": []}
        updated_calls = {}

        def mock_update(task_id, **kwargs):
            updated_calls[task_id] = updated_calls.get(task_id, [])
            updated_calls[task_id].append(kwargs)
            return task_b

        with patch("brain.daemon.get_pending_tasks", return_value=[task_b]), \
             patch("brain.daemon.update_task", side_effect=mock_update), \
             patch("brain.queue.get_task", return_value=task_a), \
             patch("brain.daemon.enrich_prompt", return_value=_make_enriched()), \
             patch("brain.daemon.validate_prompt", return_value=[]), \
             patch("brain.daemon.has_blockers", return_value=False), \
             patch("brain.agents.run_agent", return_value=agent_result):

            results = process_queue(config=_CONFIG)

        assert len(results) == 1
        assert results[0]["status"] == "done"
        assert results[0]["result_preview"] == "B completed"

    # --- 8. Mixed results ---

    def test_mixed_results_all_summaries_correct(self):
        """3 tasks: one succeeds, one fails, one needs input."""
        from brain.daemon import process_queue

        task_ok = _make_task(task_id="ok000001", description="succeeds")
        task_fail = _make_task(task_id="fail0001", description="fails")
        task_qi = _make_task(task_id="qi000001", description="questions")

        call_count = {"n": 0}

        def mock_run_agent(task, enriched_prompt, config):
            call_count["n"] += 1
            if task.id == "ok000001":
                return {"result": "All good", "questions": []}
            elif task.id == "fail0001":
                raise RuntimeError("Disk full")
            elif task.id == "qi000001":
                return {"result": "", "questions": ["Which branch?"]}
            return {"result": "", "questions": []}

        def mock_update(task_id, **kwargs):
            return _make_task(task_id=task_id)

        with patch("brain.daemon.get_pending_tasks", return_value=[task_ok, task_fail, task_qi]), \
             patch("brain.daemon.update_task", side_effect=mock_update), \
             patch("brain.daemon.enrich_prompt", return_value=_make_enriched()), \
             patch("brain.daemon.validate_prompt", return_value=[]), \
             patch("brain.daemon.has_blockers", return_value=False), \
             patch("brain.agents.run_agent", side_effect=mock_run_agent):

            results = process_queue(config=_CONFIG)

        assert len(results) == 3

        result_map = {r["id"]: r for r in results}

        assert result_map["ok000001"]["status"] == "done"
        assert result_map["ok000001"]["result_preview"] == "All good"

        assert result_map["fail0001"]["status"] == "failed"
        assert "Disk full" in result_map["fail0001"]["result_preview"]

        assert result_map["qi000001"]["status"] == "needs_input"
        assert "Which branch?" in result_map["qi000001"]["result_preview"]

    # --- 9. run_overnight ---

    def test_run_overnight_calls_process_and_briefing(self):
        """run_overnight calls process_queue and generate_briefing."""
        from brain.daemon import run_overnight

        with patch("brain.daemon._setup_logging"), \
             patch("brain.daemon.load_config", return_value=_CONFIG), \
             patch("brain.daemon.process_queue", return_value=[]) as mock_pq, \
             patch("brain.daemon.generate_briefing", return_value=MagicMock()) as mock_gb, \
             patch("brain.daemon.save_briefing") as mock_sb:

            run_overnight(config=_CONFIG)

        mock_pq.assert_called_once_with(config=_CONFIG)
        mock_gb.assert_called_once_with(config=_CONFIG)
        mock_sb.assert_called_once()
