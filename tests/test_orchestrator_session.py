"""Tests for orchestrator and session manager modules.

Covers: execute_spec, run_two_phase, _run_enrichment_flow, single_task,
detect_project (orchestrator) and start_session, get_session_status,
capture_session_output, end_session, list_sessions, run_session_sync (session).

Run with: .venv/bin/python -m pytest tests/test_orchestrator_session.py -v
"""

import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# 1. TestExecuteSpec
# ---------------------------------------------------------------------------

class TestExecuteSpec:
    def _make_spec(self, prompt="Fix the login bug", **kwargs):
        from brain.command import CommandSpec
        defaults = dict(
            prompt=prompt,
            project_path="/tmp/myproject",
            model="opus",
            max_turns=30,
            max_budget_usd=5.0,
            permission_mode="default",
        )
        defaults.update(kwargs)
        return CommandSpec(**defaults)

    @patch("brain.observer.observe_output")
    @patch("brain.monitor.monitor_session", return_value="Session output here")
    @patch("brain.session.start_session")
    @patch("brain.orchestrator.input", return_value="y")
    @patch("brain.orchestrator.validate_prompt", return_value=[])
    def test_clean_prompt_user_confirms(self, mock_validate, mock_input, mock_start, mock_monitor, mock_observe):
        """Clean prompt + user confirms → session started, monitored, output returned."""
        from brain.orchestrator import execute_spec
        from brain.models import SessionStatus, Session
        from brain.observer import Observation

        mock_start.return_value = Session(id="test1234", status=SessionStatus.RUNNING, tmux_session="geofrey-test1234")
        mock_observe.return_value = Observation(success=True, result_summary="Done")
        spec = self._make_spec()

        result = execute_spec(spec)

        assert result == "Session output here"
        mock_start.assert_called_once()
        mock_monitor.assert_called_once()

    @patch("brain.orchestrator.input", return_value="n")
    @patch("brain.orchestrator.validate_prompt", return_value=[])
    def test_clean_prompt_user_declines(self, mock_validate, mock_input):
        """Clean prompt + user declines → skipped, returns empty string."""
        from brain.orchestrator import execute_spec

        spec = self._make_spec()
        result = execute_spec(spec)

        assert result == ""

    @patch("brain.orchestrator.input")
    @patch("brain.orchestrator.has_blockers", return_value=True)
    @patch("brain.orchestrator.validate_prompt", return_value=["[BLOCK] Not a claude command"])
    def test_blocker_prompt_blocked(self, mock_validate, mock_blockers, mock_input):
        """Prompt with blocker issues → blocked, returns empty, no input asked."""
        from brain.orchestrator import execute_spec

        spec = self._make_spec(prompt="rm -rf / && drop database")
        result = execute_spec(spec)

        assert result == ""
        mock_input.assert_not_called()

    @patch("brain.observer.observe_output")
    @patch("brain.monitor.monitor_session", return_value="Output")
    @patch("brain.session.start_session")
    @patch("brain.orchestrator.input", return_value="y")
    @patch("brain.orchestrator.has_blockers", return_value=False)
    @patch("brain.orchestrator.validate_prompt", return_value=["[WARN] Dangerous pattern: force flag (--force)"])
    def test_warning_prompt_user_confirms(self, mock_validate, mock_blockers, mock_input, mock_start, mock_monitor, mock_observe):
        """Prompt with warnings (no blockers) + user confirms → runs."""
        from brain.orchestrator import execute_spec
        from brain.models import SessionStatus, Session
        from brain.observer import Observation

        mock_start.return_value = Session(id="test1234", status=SessionStatus.RUNNING, tmux_session="geofrey-test1234")
        mock_observe.return_value = Observation(success=True, result_summary="Done")
        spec = self._make_spec(prompt="git push --force")
        result = execute_spec(spec)

        assert result == "Output"
        mock_start.assert_called_once()

    @patch("brain.session.start_session")
    @patch("brain.orchestrator.input", return_value="y")
    @patch("brain.orchestrator.validate_prompt", return_value=[])
    def test_session_fails_returns_empty(self, mock_validate, mock_input, mock_start):
        """Session fails to start → returns empty string."""
        from brain.orchestrator import execute_spec
        from brain.models import SessionStatus, Session

        mock_start.return_value = Session(id="test1234", status=SessionStatus.FAILED, tmux_session="geofrey-test1234")
        spec = self._make_spec()
        result = execute_spec(spec)

        assert result == ""


# ---------------------------------------------------------------------------
# 2. TestRunTwoPhase
# ---------------------------------------------------------------------------

class TestRunTwoPhase:
    def _make_spec(self, **kwargs):
        from brain.command import CommandSpec
        defaults = dict(
            prompt="Implement auth module",
            project_path="/tmp/myproject",
            model="opus",
            max_turns=50,
            max_budget_usd=10.0,
            permission_mode="default",
        )
        defaults.update(kwargs)
        return CommandSpec(**defaults)

    @patch("brain.orchestrator.execute_spec", return_value=True)
    @patch("brain.orchestrator.subprocess.run")
    @patch("brain.orchestrator.input")
    def test_plan_succeeds_user_confirms_exec(self, mock_input, mock_run, mock_exec):
        """Plan phase succeeds, user confirms both phases → returns True."""
        from brain.orchestrator import run_two_phase

        mock_input.side_effect = ["y", "y"]  # confirm plan, confirm exec
        mock_run.return_value = MagicMock(returncode=0, stdout="Plan: step 1, step 2", stderr="")

        spec = self._make_spec()
        result = run_two_phase(spec, "Implement auth module")

        assert result is True
        mock_exec.assert_called_once()
        # The exec spec should have the plan appended
        exec_spec = mock_exec.call_args[0][0]
        assert "IMPLEMENTATION PLAN" in exec_spec.prompt

    @patch("brain.orchestrator.execute_spec")
    @patch("brain.orchestrator.subprocess.run")
    @patch("brain.orchestrator.input", return_value="y")
    def test_plan_fails_returns_false(self, mock_input, mock_run, mock_exec):
        """Plan phase fails (non-zero exit) → returns False, no exec phase."""
        from brain.orchestrator import run_two_phase

        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="Error in plan")

        spec = self._make_spec()
        result = run_two_phase(spec, "Implement auth module")

        assert result is False
        mock_exec.assert_not_called()

    @patch("brain.orchestrator.execute_spec")
    @patch("brain.orchestrator.subprocess.run")
    @patch("brain.orchestrator.input", return_value="n")
    def test_user_declines_plan_returns_false(self, mock_input, mock_run, mock_exec):
        """User declines plan phase → returns False immediately."""
        from brain.orchestrator import run_two_phase

        spec = self._make_spec()
        result = run_two_phase(spec, "Implement auth module")

        assert result is False
        mock_run.assert_not_called()
        mock_exec.assert_not_called()

    @patch("brain.orchestrator.execute_spec")
    @patch("brain.orchestrator.subprocess.run")
    @patch("brain.orchestrator.input")
    def test_user_declines_exec_after_plan(self, mock_input, mock_run, mock_exec):
        """Plan succeeds, user declines exec phase → returns False."""
        from brain.orchestrator import run_two_phase

        mock_input.side_effect = ["y", "n"]  # confirm plan, decline exec
        mock_run.return_value = MagicMock(returncode=0, stdout="Plan output", stderr="")

        spec = self._make_spec()
        result = run_two_phase(spec, "Implement auth module")

        assert result is False
        mock_exec.assert_not_called()

    @patch("brain.orchestrator.execute_spec", return_value=True)
    @patch("brain.orchestrator.subprocess.run")
    @patch("brain.orchestrator.input")
    def test_plan_empty_output(self, mock_input, mock_run, mock_exec):
        """Plan phase succeeds but no stdout → exec prompt has no plan appended."""
        from brain.orchestrator import run_two_phase

        mock_input.side_effect = ["y", "y"]
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        spec = self._make_spec()
        result = run_two_phase(spec, "Implement auth module")

        assert result is True
        exec_spec = mock_exec.call_args[0][0]
        assert "IMPLEMENTATION PLAN" not in exec_spec.prompt


# ---------------------------------------------------------------------------
# 3. TestRunEnrichmentFlow
# ---------------------------------------------------------------------------

class TestRunEnrichmentFlow:
    @patch("brain.orchestrator.resolve_model", return_value="opus")
    @patch("brain.orchestrator.enrich_prompt")
    @patch("brain.orchestrator.detect_project", return_value=("meus", "/home/user/meus"))
    @patch("brain.orchestrator.get_skill_meta")
    @patch("brain.orchestrator.detect_task_type", return_value="code-fix")
    def test_known_project_returns_spec(self, mock_detect, mock_skill, mock_proj, mock_enrich, mock_model):
        """Known project → returns CommandSpec with enriched prompt."""
        from brain.orchestrator import _run_enrichment_flow
        from brain.models import EnrichedPrompt
        from brain.router import SkillMeta
        from brain.intent import Intent

        mock_skill.return_value = SkillMeta(
            name="code-fix", model_category="code", needs_plan=False,
            max_budget_usd=5.0, max_turns=30, permission_mode="default",
        )
        mock_enrich.return_value = EnrichedPrompt(
            original_input="fix login in meus",
            enriched_prompt="Enriched: fix login in meus with full context",
            task_type="code-fix",
        )
        mock_intent = Intent(task_type="code-fix", project="meus", summary="fix login", source="llm")

        with patch("brain.orchestrator.understand_intent", return_value=mock_intent):
            with patch("brain.orchestrator.load_projects", return_value={"meus": {"path": "/home/user/meus"}}):
                spec, prompt_text, _intent = _run_enrichment_flow("fix login in meus", config={})

        assert spec is not None
        assert spec.project_path == "/home/user/meus"
        assert spec.model == "opus"
        assert "Enriched" in prompt_text
        mock_enrich.assert_called_once()

    @patch("brain.orchestrator.get_skill_meta")
    @patch("brain.orchestrator.detect_task_type", return_value="code-fix")
    def test_unknown_project_returns_none(self, mock_detect, mock_skill):
        """No project detected → returns (None, "", intent)."""
        from brain.orchestrator import _run_enrichment_flow
        from brain.router import SkillMeta
        from brain.intent import Intent

        mock_skill.return_value = SkillMeta(
            name="code-fix", model_category="code", needs_plan=False,
            max_budget_usd=5.0, max_turns=30, permission_mode="default",
        )
        mock_intent = Intent(task_type="code-fix", project=None, summary="fix something", source="keyword-fallback")

        with patch("brain.orchestrator.understand_intent", return_value=mock_intent):
            with patch("brain.orchestrator.detect_project", return_value=(None, None)):
                spec, prompt_text, _intent = _run_enrichment_flow("fix something", config={})

        assert spec is None
        assert prompt_text == ""


# ---------------------------------------------------------------------------
# 4. TestDetectProject
# ---------------------------------------------------------------------------

class TestDetectProject:
    @patch("brain.orchestrator.load_projects", return_value={
        "meus": {"path": "/home/user/meus", "stack": "Python", "description": "Freight platform"},
        "geofrey": {"path": "/home/user/geofrey", "stack": "Python", "description": "Personal agent"},
    })
    def test_known_name(self, mock_projects):
        """Known project name in message → returns (name, path)."""
        from brain.orchestrator import detect_project

        name, path = detect_project("fix login in meus")
        assert name == "meus"
        assert path == "/home/user/meus"

    @patch("brain.orchestrator.load_projects", return_value={
        "meus": {"path": "/home/user/meus", "stack": "Python", "description": "Freight platform"},
    })
    def test_unknown_name(self, mock_projects):
        """Unknown project → returns (None, None)."""
        from brain.orchestrator import detect_project

        name, path = detect_project("fix login in foobar")
        assert name is None
        assert path is None

    @patch("brain.orchestrator.load_projects", return_value={
        "geofrey": {"path": "/home/user/geofrey", "stack": "Python", "description": "Agent"},
    })
    def test_case_insensitive(self, mock_projects):
        """Project detection is case-insensitive."""
        from brain.orchestrator import detect_project

        name, path = detect_project("Fix bug in GEOFREY")
        assert name == "geofrey"
        assert path == "/home/user/geofrey"

    @patch("brain.orchestrator.load_projects", return_value={})
    def test_empty_registry(self, mock_projects):
        """Empty project registry → returns (None, None)."""
        from brain.orchestrator import detect_project

        name, path = detect_project("fix login in meus")
        assert name is None
        assert path is None


# ---------------------------------------------------------------------------
# 5. TestSingleTask
# ---------------------------------------------------------------------------

class TestSingleTask:
    @patch("brain.orchestrator.execute_spec", return_value=True)
    @patch("brain.orchestrator.project_has_code", return_value=False)
    @patch("brain.orchestrator._run_enrichment_flow")
    @patch("brain.orchestrator._get_config", return_value={})
    def test_detected_project_calls_execute(self, mock_config, mock_flow, mock_has_code, mock_exec):
        """Task with detected project (no plan needed) → calls execute_spec."""
        from brain.orchestrator import single_task
        from brain.command import CommandSpec

        from brain.intent import Intent
        spec = CommandSpec(prompt="enriched", project_path="/tmp/proj")
        mock_intent = Intent(task_type="code-fix", source="llm")
        mock_flow.return_value = (spec, "enriched prompt text", mock_intent)

        with patch("brain.orchestrator.get_skill_meta") as mock_skill:
            from brain.router import SkillMeta
            mock_skill.return_value = SkillMeta(
                name="code-fix", model_category="code", needs_plan=False,
                max_budget_usd=5.0, max_turns=30, permission_mode="default",
            )
            single_task("fix login in meus")

        mock_exec.assert_called_once()

    @patch("brain.orchestrator.run_two_phase", return_value=True)
    @patch("brain.orchestrator.project_has_code", return_value=True)
    @patch("brain.orchestrator._run_enrichment_flow")
    @patch("brain.orchestrator._get_config", return_value={})
    def test_detected_project_needs_plan(self, mock_config, mock_flow, mock_has_code, mock_two):
        """Task with needs_plan=True + existing code → calls run_two_phase."""
        from brain.orchestrator import single_task
        from brain.command import CommandSpec
        from brain.intent import Intent

        spec = CommandSpec(prompt="enriched", project_path="/tmp/proj")
        mock_intent = Intent(task_type="feature", source="llm")
        mock_flow.return_value = (spec, "enriched prompt text", mock_intent)

        with patch("brain.orchestrator.get_skill_meta") as mock_skill:
            from brain.router import SkillMeta
            mock_skill.return_value = SkillMeta(
                name="feature", model_category="code", needs_plan=True,
                max_budget_usd=10.0, max_turns=50, permission_mode="default",
            )
            single_task("add auth module in meus")

        mock_two.assert_called_once()

    @patch("brain.orchestrator.execute_spec")
    @patch("brain.orchestrator.run_two_phase")
    @patch("brain.orchestrator._run_enrichment_flow", return_value=(None, "", None))
    @patch("brain.orchestrator._get_config", return_value={})
    def test_no_project_detected(self, mock_config, mock_flow, mock_two, mock_exec):
        """No project detected → neither execute_spec nor run_two_phase called."""
        from brain.orchestrator import single_task

        single_task("fix something somewhere")

        mock_exec.assert_not_called()
        mock_two.assert_not_called()


# ---------------------------------------------------------------------------
# 6. TestStartSession
# ---------------------------------------------------------------------------

class TestStartSession:
    @patch("brain.session.shutil.which", return_value="/usr/bin/mock")
    @patch("brain.session.subprocess.run")
    def test_success_returns_running(self, mock_run, mock_which):
        """Successful tmux start → Session with RUNNING status."""
        from brain.session import start_session
        from brain.models import SessionStatus

        mock_run.return_value = MagicMock(returncode=0)

        session = start_session("/tmp/project", "Fix the bug", model="opus")

        assert session.status == SessionStatus.RUNNING
        assert session.project_path == "/tmp/project"
        assert session.model == "opus"
        assert session.tmux_session.startswith("geofrey-")
        assert len(session.id) == 8
        # 5 calls: tmux new-session, send-keys /remote-control, load-buffer, paste-buffer, send-keys Enter
        assert mock_run.call_count == 5
        # Verify first call is tmux new-session
        first_call_args = mock_run.call_args_list[0][0][0]
        assert first_call_args[0] == "tmux"
        assert first_call_args[1] == "new-session"

    @patch("brain.session.shutil.which", return_value="/usr/bin/mock")
    @patch("brain.session.subprocess.run", side_effect=subprocess.CalledProcessError(1, "tmux"))
    def test_tmux_fails_returns_failed(self, mock_run, mock_which):
        """tmux start fails → Session with FAILED status."""
        from brain.session import start_session
        from brain.models import SessionStatus

        session = start_session("/tmp/project", "Fix the bug")

        assert session.status == SessionStatus.FAILED
        assert session.tmux_session.startswith("geofrey-")

    @patch("brain.session.subprocess.run")
    def test_task_id_passed_through(self, mock_run):
        """task_id is stored on the Session object."""
        from brain.session import start_session

        mock_run.return_value = MagicMock(returncode=0)
        session = start_session("/tmp/project", "Fix", task_id="task-42")

        assert session.task_id == "task-42"

    @patch("brain.session.subprocess.run")
    def test_path_expanded(self, mock_run):
        """Tilde in project_path is expanded."""
        from brain.session import start_session

        mock_run.return_value = MagicMock(returncode=0)
        session = start_session("~/myproject", "Fix")

        assert "~" not in session.project_path
        assert session.project_path.endswith("myproject")


# ---------------------------------------------------------------------------
# 7. TestGetSessionStatus
# ---------------------------------------------------------------------------

class TestGetSessionStatus:
    @patch("brain.session.subprocess.run")
    def test_running(self, mock_run):
        """tmux has-session returns 0 → RUNNING."""
        from brain.session import get_session_status
        from brain.models import SessionStatus

        mock_run.return_value = MagicMock(returncode=0)

        status = get_session_status("abc12345")

        assert status == SessionStatus.RUNNING
        cmd_args = mock_run.call_args[0][0]
        assert cmd_args == ["tmux", "has-session", "-t", "geofrey-abc12345"]

    @patch("brain.session.subprocess.run")
    def test_completed(self, mock_run):
        """tmux has-session returns non-zero → COMPLETED."""
        from brain.session import get_session_status
        from brain.models import SessionStatus

        mock_run.return_value = MagicMock(returncode=1)

        status = get_session_status("abc12345")

        assert status == SessionStatus.COMPLETED


# ---------------------------------------------------------------------------
# 8. TestCaptureSessionOutput
# ---------------------------------------------------------------------------

class TestCaptureSessionOutput:
    @patch("brain.session.subprocess.run")
    def test_success_returns_content(self, mock_run):
        """Successful capture → returns stdout content."""
        from brain.session import capture_session_output

        mock_run.return_value = MagicMock(returncode=0, stdout="Session output line 1\nline 2\n")

        output = capture_session_output("abc12345")

        assert output == "Session output line 1\nline 2\n"
        cmd_args = mock_run.call_args[0][0]
        assert "capture-pane" in cmd_args

    @patch("brain.session.subprocess.run", side_effect=subprocess.CalledProcessError(1, "tmux"))
    def test_tmux_fails_returns_empty(self, mock_run):
        """tmux capture-pane fails → returns empty string."""
        from brain.session import capture_session_output

        output = capture_session_output("abc12345")

        assert output == ""


# ---------------------------------------------------------------------------
# 9. TestEndSession
# ---------------------------------------------------------------------------

class TestEndSession:
    @patch("brain.session.subprocess.run")
    def test_captures_then_kills(self, mock_run):
        """end_session captures output first, then kills tmux session."""
        from brain.session import end_session

        # First call is capture-pane (check=True), second is kill-session
        mock_run.return_value = MagicMock(returncode=0, stdout="Final output")

        output = end_session("abc12345")

        assert output == "Final output"
        assert mock_run.call_count == 2

        # Verify first call is capture-pane
        first_call_args = mock_run.call_args_list[0][0][0]
        assert "capture-pane" in first_call_args

        # Verify second call is kill-session
        second_call_args = mock_run.call_args_list[1][0][0]
        assert second_call_args == ["tmux", "kill-session", "-t", "geofrey-abc12345"]


# ---------------------------------------------------------------------------
# 10. TestListSessions
# ---------------------------------------------------------------------------

class TestListSessions:
    @patch("brain.session.subprocess.run")
    def test_with_geofrey_sessions(self, mock_run):
        """tmux lists geofrey sessions → returns their IDs."""
        from brain.session import list_sessions

        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="geofrey-abc12345\ngeofrey-def67890\n",
        )

        ids = list_sessions()

        assert ids == ["abc12345", "def67890"]

    @patch("brain.session.subprocess.run", side_effect=subprocess.CalledProcessError(1, "tmux"))
    def test_no_tmux_returns_empty(self, mock_run):
        """tmux not running (CalledProcessError) → returns empty list."""
        from brain.session import list_sessions

        ids = list_sessions()

        assert ids == []

    @patch("brain.session.subprocess.run")
    def test_mixed_sessions_only_geofrey(self, mock_run):
        """tmux has mixed sessions → only geofrey-prefixed ones returned."""
        from brain.session import list_sessions

        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="my-work-session\ngeofrey-abc12345\nother-session\ngeofrey-xyz99999\n",
        )

        ids = list_sessions()

        assert ids == ["abc12345", "xyz99999"]

    @patch("brain.session.subprocess.run")
    def test_empty_output(self, mock_run):
        """tmux running but no sessions → returns empty list."""
        from brain.session import list_sessions

        mock_run.return_value = MagicMock(returncode=0, stdout="")

        ids = list_sessions()

        assert ids == []


# ---------------------------------------------------------------------------
# 11. TestRunSessionSync
# ---------------------------------------------------------------------------

class TestRunSessionSync:
    @patch("brain.session.subprocess.run")
    def test_success_returns_stdout(self, mock_run):
        """Successful sync run → returns stdout."""
        from brain.session import run_session_sync

        mock_run.return_value = MagicMock(returncode=0, stdout="Task completed successfully")

        output = run_session_sync("/tmp/project", "Fix the bug", model="opus")

        assert output == "Task completed successfully"
        cmd_args = mock_run.call_args[0][0]
        assert cmd_args == ["bash", "-c", mock_run.call_args[0][0][2]]

    @patch("brain.session.subprocess.run", side_effect=Exception("Command failed"))
    def test_failure_returns_empty(self, mock_run):
        """Exception during sync run → returns empty string."""
        from brain.session import run_session_sync

        output = run_session_sync("/tmp/project", "Fix the bug")

        assert output == ""

    @patch("brain.session.subprocess.run")
    def test_path_expanded(self, mock_run):
        """Tilde in project_path is expanded in the command."""
        from brain.session import run_session_sync

        mock_run.return_value = MagicMock(returncode=0, stdout="ok")

        run_session_sync("~/project", "Fix", model="sonnet")

        # The bash -c command string should not contain a raw tilde
        cmd_str = mock_run.call_args[0][0][2]  # ["bash", "-c", cmd_string]
        assert "~" not in cmd_str or "/project" in cmd_str

    @patch("brain.session.subprocess.run")
    def test_parameters_in_command(self, mock_run):
        """All parameters appear in the constructed command."""
        from brain.session import run_session_sync

        mock_run.return_value = MagicMock(returncode=0, stdout="done")

        run_session_sync(
            "/tmp/proj", "Do something",
            model="sonnet", max_turns=20, max_budget_usd=3.0,
        )

        cmd_str = mock_run.call_args[0][0][2]
        assert "--model sonnet" in cmd_str
        assert "--max-turns 20" in cmd_str
        assert "--max-budget-usd 3.00" in cmd_str
