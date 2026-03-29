"""Comprehensive tests for geofrey's new modules.

Covers: command builder, router, gates, enricher, context gatherer,
task queue, briefing, and shared models.

Run with: .venv/bin/python -m pytest tests/test_new_modules.py -v
"""

import sqlite3
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Project root for git-dependent tests (geofrey itself is a git repo)
GEOFREY_ROOT = str(PROJECT_ROOT)


# ---------------------------------------------------------------------------
# 1. TestCommandBuilder
# ---------------------------------------------------------------------------

class TestCommandBuilder:
    def test_build_command_basic(self):
        """Output starts with 'claude' and contains all expected flags."""
        from brain.command import CommandSpec, build_command

        spec = CommandSpec(
            prompt="Fix the login bug",
            project_path="/tmp/myproject",
            model="opus",
            max_turns=200,
            permission_mode="default",
        )
        cmd = build_command(spec)

        assert cmd.startswith("claude")
        assert "-p" in cmd
        assert "--cwd" in cmd
        assert "--model" in cmd
        assert "opus" in cmd
        assert "--max-turns" in cmd
        assert "200" in cmd
        # default permission_mode should NOT add --permission-mode
        assert "--permission-mode" not in cmd

    def test_build_command_escaping(self):
        """Prompt with quotes and special chars is safely escaped via shlex."""
        from brain.command import CommandSpec, build_command

        spec = CommandSpec(
            prompt='Fix the "login" bug & handle $HOME path',
            project_path="/tmp/my project",
        )
        cmd = build_command(spec)

        # shlex.quote wraps in single quotes or escapes properly
        assert "claude" in cmd
        # The raw quotes/special chars should not appear unescaped
        assert '"login"' not in cmd or "'" in cmd  # wrapped by shlex

    def test_build_command_plan_mode(self):
        """--permission-mode plan is added when not 'default'."""
        from brain.command import CommandSpec, build_command

        spec = CommandSpec(
            prompt="Review the code",
            project_path="/tmp/myproject",
            permission_mode="plan",
        )
        cmd = build_command(spec)

        assert "--permission-mode" in cmd
        assert "plan" in cmd

    def test_resolve_model_from_config(self):
        """Config-based model mapping overrides defaults."""
        from brain.command import resolve_model

        config = {"model_policy": {"code": "sonnet", "analysis": "haiku"}}
        assert resolve_model("code", config) == "sonnet"
        assert resolve_model("analysis", config) == "haiku"

    def test_resolve_model_defaults(self):
        """Fallback when config has no model_policy."""
        from brain.command import resolve_model

        config = {}
        assert resolve_model("code", config) == "opus"
        assert resolve_model("analysis", config) == "opus"
        assert resolve_model("content", config) == "sonnet"

    def test_project_has_code_true(self, tmp_path):
        """Project with .git directory is detected as having code."""
        from brain.command import project_has_code

        (tmp_path / ".git").mkdir()
        assert project_has_code(str(tmp_path)) is True

    def test_project_has_code_false(self, tmp_path):
        """Empty temp dir has no code indicators."""
        from brain.command import project_has_code

        assert project_has_code(str(tmp_path)) is False


# ---------------------------------------------------------------------------
# 2. TestRouter
# ---------------------------------------------------------------------------

class TestRouter:
    def test_detect_task_type_feature(self):
        """'add new login page' routes to 'feature'."""
        from brain.router import detect_task_type

        assert detect_task_type("add new login page") == "feature"

    def test_detect_task_type_bug(self):
        """'fix the crash' routes to 'code-fix'."""
        from brain.router import detect_task_type

        assert detect_task_type("fix the crash") == "code-fix"

    def test_detect_task_type_review(self):
        """'review the PR' routes to 'review'."""
        from brain.router import detect_task_type

        assert detect_task_type("review the PR") == "review"

    def test_detect_task_type_german(self):
        """'erstelle neues Feature' routes to 'feature'."""
        from brain.router import detect_task_type

        assert detect_task_type("erstelle neues Feature") == "feature"

    def test_detect_task_type_fallback(self):
        """Unmatched input falls back to 'code-fix'."""
        from brain.router import detect_task_type

        assert detect_task_type("hello world") == "code-fix"

    def test_get_skill_meta_from_config(self):
        """Config values override hardcoded defaults."""
        from brain.router import get_skill_meta

        config = {
            "skill_defaults": {
                "feature": {
                    "model_category": "sonnet",
                    "max_turns": 100,
                    "permission_mode": "plan",
                    "needs_plan": False,
                },
            },
        }
        meta = get_skill_meta("feature", config)
        assert meta.name == "feature"
        assert meta.model_category == "sonnet"
        assert meta.max_turns == 100
        assert meta.permission_mode == "plan"
        assert meta.needs_plan is False

    def test_get_skill_meta_defaults(self):
        """Fallback values when config has no skill_defaults."""
        from brain.router import get_skill_meta

        config = {}
        meta = get_skill_meta("code-fix", config)
        assert meta.name == "code-fix"
        assert meta.model_category == "code"
        assert meta.max_turns == 200
        assert meta.permission_mode == "default"
        assert meta.needs_plan is False


# ---------------------------------------------------------------------------
# 3. TestGates
# ---------------------------------------------------------------------------

class TestGates:
    def test_validate_prompt_clean(self):
        """Normal prompt returns empty issues list."""
        from brain.gates import validate_prompt

        issues = validate_prompt("Please refactor the authentication module")
        assert issues == []

    def test_validate_prompt_secret(self):
        """Prompt containing 'password' triggers a warning."""
        from brain.gates import validate_prompt

        issues = validate_prompt("Set the password to admin123")
        assert len(issues) >= 1
        assert any("password" in i for i in issues)

    def test_validate_prompt_dangerous(self):
        """Prompt containing 'rm -rf' triggers a warning."""
        from brain.gates import validate_prompt

        issues = validate_prompt("Run rm -rf /tmp/old-build")
        assert len(issues) >= 1
        assert any("rm -rf" in i for i in issues)

    def test_validate_prompt_multiple(self):
        """Prompt with both secret and dangerous patterns returns multiple warnings."""
        from brain.gates import validate_prompt

        issues = validate_prompt("Use password=secret then rm -rf /old")
        assert len(issues) >= 2
        labels = " ".join(issues)
        assert "password" in labels
        assert "rm -rf" in labels


# ---------------------------------------------------------------------------
# 4. TestEnrichmentRules
# ---------------------------------------------------------------------------

class TestEnrichmentRules:
    def test_load_enrichment_rules(self):
        """At least 7 default rules are loaded."""
        from brain.enricher import load_enrichment_rules

        rules = load_enrichment_rules()
        assert len(rules) >= 7
        expected_types = {"code-fix", "feature", "refactor", "review", "research", "security", "doc-sync"}
        assert expected_types.issubset(set(rules.keys()))

    def test_rule_code_fix(self):
        """code-fix rule includes git_status and diff_scope."""
        from brain.enricher import load_enrichment_rules

        rules = load_enrichment_rules()
        rule = rules["code-fix"]
        assert rule.include_git_status is True
        assert rule.include_diff_scope is True
        assert rule.include_architecture is False

    def test_rule_feature_needs_architecture(self):
        """feature rule includes architecture."""
        from brain.enricher import load_enrichment_rules

        rules = load_enrichment_rules()
        rule = rules["feature"]
        assert rule.include_architecture is True

    def test_rule_research_no_git(self):
        """research rule does not include git status."""
        from brain.enricher import load_enrichment_rules

        rules = load_enrichment_rules()
        rule = rules["research"]
        assert rule.include_git_status is False
        assert rule.include_recent_commits is False
        assert rule.include_diff_scope is False


# ---------------------------------------------------------------------------
# 5. TestContextGatherer
# ---------------------------------------------------------------------------

class TestContextGatherer:
    @patch("brain.context_gatherer._query_chromadb", return_value="")
    def test_gather_project_context(self, mock_chromadb):
        """Test with the geofrey project itself (real git repo)."""
        from brain.context_gatherer import gather_project_context

        ctx = gather_project_context(GEOFREY_ROOT, "geofrey", config={})
        assert ctx.git_branch != "", "Branch should not be empty for a git repo"
        assert ctx.git_status is not None  # may be empty string if clean
        assert ctx.claude_md != "", "CLAUDE.md exists in geofrey"

    @patch("brain.context_gatherer._query_chromadb", return_value="")
    def test_gather_project_context_nonexistent(self, mock_chromadb):
        """Non-existent path returns empty strings, does not crash."""
        from brain.context_gatherer import gather_project_context

        ctx = gather_project_context("/tmp/nonexistent_project_xyz", "fake", config={})
        assert ctx.git_branch == ""
        assert ctx.git_status == ""
        assert ctx.claude_md == ""
        assert ctx.architecture == ""


# ---------------------------------------------------------------------------
# 6. TestEnricher
# ---------------------------------------------------------------------------

class TestEnricher:
    @patch("brain.enricher.gather_project_context")
    @patch("brain.enricher.gather_dach_context", return_value="")
    def test_enrich_prompt_basic(self, mock_dach, mock_ctx):
        """Enriched prompt is longer than the original input."""
        from brain.enricher import enrich_prompt
        from brain.models import ProjectContext

        mock_ctx.return_value = ProjectContext(
            project_name="test",
            project_path="/tmp/test",
            git_branch="main",
            git_status="M file.py",
            recent_commits="abc1234 initial commit",
        )

        result = enrich_prompt(
            user_input="Fix the login bug",
            project_name="test",
            project_path="/tmp/test",
            task_type="code-fix",
            config={},
        )
        assert len(result.enriched_prompt) > len("Fix the login bug")

    @patch("brain.enricher.gather_project_context")
    @patch("brain.enricher.gather_dach_context", return_value="")
    def test_enrich_prompt_contains_task(self, mock_dach, mock_ctx):
        """Original user input appears in the enriched prompt."""
        from brain.enricher import enrich_prompt
        from brain.models import ProjectContext

        mock_ctx.return_value = ProjectContext(
            project_name="test",
            project_path="/tmp/test",
        )

        result = enrich_prompt(
            user_input="Implement user authentication",
            project_name="test",
            project_path="/tmp/test",
            task_type="feature",
            config={},
        )
        assert "Implement user authentication" in result.enriched_prompt

    @patch("brain.enricher.gather_project_context")
    @patch("brain.enricher.gather_dach_context", return_value="")
    def test_enrich_prompt_contains_git(self, mock_dach, mock_ctx):
        """Git info appears in enriched prompt for code-fix tasks."""
        from brain.enricher import enrich_prompt
        from brain.models import ProjectContext

        mock_ctx.return_value = ProjectContext(
            project_name="test",
            project_path="/tmp/test",
            git_branch="feature/auth",
            git_status="M auth.py",
        )

        result = enrich_prompt(
            user_input="Fix auth crash",
            project_name="test",
            project_path="/tmp/test",
            task_type="code-fix",
            config={},
        )
        assert "feature/auth" in result.enriched_prompt

    @patch("brain.enricher.gather_project_context")
    @patch("brain.enricher.gather_dach_context", return_value="")
    def test_enrich_prompt_post_actions(self, mock_dach, mock_ctx):
        """Post-actions are populated from enrichment rules."""
        from brain.enricher import enrich_prompt
        from brain.models import ProjectContext

        mock_ctx.return_value = ProjectContext(
            project_name="test",
            project_path="/tmp/test",
        )

        result = enrich_prompt(
            user_input="Fix the bug",
            project_name="test",
            project_path="/tmp/test",
            task_type="code-fix",
            config={},
        )
        assert len(result.post_actions) > 0
        assert result.task_type == "code-fix"


# ---------------------------------------------------------------------------
# 7. TestTaskQueue
# ---------------------------------------------------------------------------

class TestTaskQueue:
    @pytest.fixture(autouse=True)
    def _setup_db(self, tmp_path):
        """Create a temp SQLite DB path for each test."""
        self.db_path = str(tmp_path / "test_tasks.db")

    @patch("brain.queue.load_projects", return_value={})
    def test_add_task(self, mock_projects):
        """Add a task and verify it can be retrieved."""
        from brain.queue import add_task, get_task, init_db

        init_db(self.db_path)
        task = add_task("Write unit tests", db_path=self.db_path)
        assert task.description == "Write unit tests"
        assert task.status.value == "pending"

        retrieved = get_task(task.id, db_path=self.db_path)
        assert retrieved is not None
        assert retrieved.description == "Write unit tests"

    @patch("brain.queue.load_projects", return_value={})
    def test_get_pending_tasks(self, mock_projects):
        """Add 3 tasks, verify all returned as pending."""
        from brain.queue import add_task, get_pending_tasks, init_db

        init_db(self.db_path)
        add_task("Task 1", db_path=self.db_path)
        add_task("Task 2", db_path=self.db_path)
        add_task("Task 3", db_path=self.db_path)

        pending = get_pending_tasks(db_path=self.db_path)
        assert len(pending) == 3
        for t in pending:
            assert t.status.value == "pending"

    @patch("brain.queue.load_projects", return_value={})
    def test_update_task_status(self, mock_projects):
        """Add task, update to running, verify status change."""
        from brain.models import TaskStatus
        from brain.queue import add_task, get_task, init_db, update_task

        init_db(self.db_path)
        task = add_task("Running task", db_path=self.db_path)

        updated = update_task(task.id, db_path=self.db_path, status=TaskStatus.RUNNING)
        assert updated.status == TaskStatus.RUNNING
        assert updated.started_at is not None

        retrieved = get_task(task.id, db_path=self.db_path)
        assert retrieved.status == TaskStatus.RUNNING

    @patch("brain.queue.load_projects", return_value={})
    def test_get_pending_tasks_with_max(self, mock_projects):
        """max_tasks parameter limits the number of returned tasks."""
        from brain.queue import add_task, get_pending_tasks, init_db

        init_db(self.db_path)
        for i in range(5):
            add_task(f"Task {i}", db_path=self.db_path)

        limited = get_pending_tasks(db_path=self.db_path, max_tasks=3)
        assert len(limited) == 3

        all_tasks = get_pending_tasks(db_path=self.db_path)
        assert len(all_tasks) == 5

    @patch("brain.queue.load_projects", return_value={})
    def test_add_task_questions_empty(self, mock_projects):
        """Questions field is always empty on task creation, even with depends_on."""
        from brain.queue import add_task, get_task, init_db

        init_db(self.db_path)
        task = add_task("Test task", db_path=self.db_path, depends_on=["dep-1"])
        retrieved = get_task(task.id, db_path=self.db_path)
        assert retrieved.questions == []
        assert retrieved.depends_on == ["dep-1"]

    @patch("brain.queue.load_projects", return_value={})
    def test_overnight_summary(self, mock_projects):
        """Add tasks with different statuses, verify summary counts."""
        from brain.models import TaskStatus
        from brain.queue import add_task, get_overnight_summary, init_db, update_task

        init_db(self.db_path)
        t1 = add_task("Done task", db_path=self.db_path)
        update_task(t1.id, db_path=self.db_path, status=TaskStatus.DONE, result="All good")

        t2 = add_task("Failed task", db_path=self.db_path)
        update_task(t2.id, db_path=self.db_path, status=TaskStatus.FAILED, error="Boom")

        t3 = add_task("Pending task", db_path=self.db_path)

        summary = get_overnight_summary(db_path=self.db_path)
        assert summary["done"] == 1
        assert summary["failed"] == 1
        assert summary["pending"] == 1


# ---------------------------------------------------------------------------
# 8. TestBriefing
# ---------------------------------------------------------------------------

class TestBriefing:
    def test_generate_briefing_empty(self):
        """No tasks produces a briefing with empty lists."""
        from brain.briefing import generate_briefing
        from brain.models import MorningBriefing

        empty_summary = {
            "done": 0, "failed": 0, "needs_input": 0, "pending": 0, "running": 0,
            "tasks_done": [], "tasks_failed": [], "tasks_needs_input": [],
            "tasks_pending": [], "tasks_running": [],
        }
        with patch("brain.briefing.get_overnight_summary", return_value=empty_summary):
            with patch("brain.briefing.load_config", return_value={}):
                briefing = generate_briefing(config={})

        assert isinstance(briefing, MorningBriefing)
        assert briefing.done == []
        assert briefing.needs_approval == []
        assert briefing.needs_input == []

    def test_generate_briefing_with_tasks(self):
        """Briefing correctly categorizes done/failed/needs_input tasks."""
        from brain.briefing import generate_briefing
        from brain.models import MorningBriefing, Task, TaskStatus

        done_task = Task(id="t1", description="Fix bug", status=TaskStatus.DONE, result="Fixed.", project="myproj")
        failed_task = Task(id="t2", description="Deploy", status=TaskStatus.FAILED, error="Timeout", project="myproj")
        input_task = Task(id="t3", description="Config", status=TaskStatus.NEEDS_INPUT, questions=["Which env?"], project="myproj")

        summary = {
            "done": 1, "failed": 1, "needs_input": 1, "pending": 0, "running": 0,
            "tasks_done": [done_task], "tasks_failed": [failed_task],
            "tasks_needs_input": [input_task], "tasks_pending": [], "tasks_running": [],
        }
        with patch("brain.briefing.get_overnight_summary", return_value=summary):
            with patch("brain.briefing.load_config", return_value={}):
                briefing = generate_briefing(config={})

        assert len(briefing.done) == 2  # 1 done + 1 failed
        assert len(briefing.needs_input) == 1
        assert briefing.needs_input[0].task_id == "t3"
        assert len(briefing.project_status) == 1
        assert briefing.project_status[0].title == "myproj"

    def test_format_briefing_empty(self):
        """Empty briefing formatted text contains 'geofrey'."""
        from brain.briefing import format_briefing
        from brain.models import MorningBriefing

        briefing = MorningBriefing()
        text = format_briefing(briefing)
        assert "geofrey" in text
        assert "Keine Aktivität" in text

    def test_format_briefing_with_items(self):
        """Briefing with items contains category headers."""
        from brain.briefing import format_briefing
        from brain.models import BriefingItem, MorningBriefing

        briefing = MorningBriefing(
            done=[BriefingItem(category="done", title="Tests written", details="24 tests pass")],
            needs_input=[BriefingItem(category="input", title="Need API key", details="Which provider?")],
        )
        text = format_briefing(briefing)
        assert "Erledigt" in text
        assert "Tests written" in text
        assert "Brauche Input" in text
        assert "Need API key" in text


# ---------------------------------------------------------------------------
# 9. TestModels
# ---------------------------------------------------------------------------

class TestModels:
    def test_task_defaults(self):
        """Task defaults: status=PENDING, priority=NORMAL."""
        from brain.models import Task, TaskPriority, TaskStatus

        task = Task(id="test-1", description="A test task")
        assert task.status == TaskStatus.PENDING
        assert task.priority == TaskPriority.NORMAL
        assert task.project is None
        assert task.questions == []
        assert task.depends_on == []

    def test_command_spec_defaults(self):
        """CommandSpec defaults for model, turns, budget, permission."""
        from brain.command import CommandSpec

        spec = CommandSpec(prompt="test", project_path="/tmp")
        assert spec.model == "opus"
        assert spec.max_turns == 200
        assert spec.permission_mode == "default"

    def test_enrichment_rule_defaults(self):
        """EnrichmentRule defaults for all boolean fields."""
        from brain.models import EnrichmentRule

        rule = EnrichmentRule(task_type="test")
        assert rule.include_git_status is True
        assert rule.include_recent_commits is True
        assert rule.include_claude_md is True
        assert rule.include_architecture is False
        assert rule.include_session_learnings is True
        assert rule.include_dach_context is False
        assert rule.include_diff_scope is True
        assert rule.post_actions == []
        assert rule.prompt_suffix == ""


# ---------------------------------------------------------------------------
# 10. TestAgents
# ---------------------------------------------------------------------------

class TestAgents:
    def test_run_agent_returns_dict(self):
        """run_agent returns dict with 'result', 'questions', and 'review_questions' keys."""
        from brain.agents.base import run_agent
        from brain.models import AgentType, EnrichedPrompt, Task

        task = Task(id="t1", description="test", agent_type=AgentType.CODER, project_path="/tmp")
        enriched = EnrichedPrompt(
            original_input="test",
            enriched_prompt="enriched test",
            task_type="code-fix",
        )

        with patch("brain.agents.base.run_session_sync", return_value="mock output"):
            result = run_agent(task, enriched, config={"model": "opus"})

        assert isinstance(result, dict)
        assert "result" in result
        assert "questions" in result
        assert "review_questions" in result
        assert result["result"] == "mock output"
        assert result["questions"] == []

    def test_base_agent_passes_config_to_session(self):
        from brain.agents.base import BaseAgent
        from brain.models import AgentType, EnrichedPrompt, Task

        task = Task(id="t1", description="test", agent_type=AgentType.CODER, project_path="/tmp")
        enriched = EnrichedPrompt(
            original_input="test",
            enriched_prompt="enriched test",
            task_type="code-fix",
        )
        config = {"model": "sonnet", "max_turns": 20, "permission_mode": "skip"}
        agent = BaseAgent(config)

        with patch("brain.agents.base.run_session_sync", return_value="ok") as mock_sync:
            agent.execute(task, enriched)

        mock_sync.assert_called_once_with(
            project_path="/tmp",
            prompt="enriched test",
            model="sonnet",
            max_turns=20,
            permission_mode="skip",
        )


# ---------------------------------------------------------------------------
# 11. TestDaemonIntegration
# ---------------------------------------------------------------------------

class TestDaemonIntegration:
    @pytest.fixture(autouse=True)
    def _setup_db(self, tmp_path):
        """Create a temp SQLite DB for daemon tests."""
        self.db_path = str(tmp_path / "test_tasks.db")

    @patch("brain.queue.load_projects", return_value={})
    def test_process_queue_e2e(self, mock_projects):
        """Full process_queue cycle: add task → process → verify done."""
        from brain.daemon import process_queue
        from brain.models import Task, TaskStatus
        from brain.queue import add_task, init_db

        init_db(self.db_path)
        task = add_task("Test task", db_path=self.db_path)

        updated_tasks = {}

        def mock_update(task_id, **kwargs):
            updated_tasks[task_id] = kwargs
            return task

        with patch("brain.daemon.get_pending_tasks", return_value=[task]), \
             patch("brain.daemon.update_task", side_effect=mock_update), \
             patch("brain.daemon.enrich_prompt") as mock_enrich, \
             patch("brain.daemon.validate_prompt", return_value=[]), \
             patch("brain.daemon.has_blockers", return_value=False), \
             patch("brain.agents.base.run_session_sync", return_value="Task completed successfully"):

            from brain.models import EnrichedPrompt
            mock_enrich.return_value = EnrichedPrompt(
                original_input="Test task",
                enriched_prompt="Enriched: Test task",
                task_type="code-fix",
            )

            results = process_queue(config={"model_policy": {"code": "opus"}})

        assert len(results) == 1
        assert results[0]["status"] == "done"
        assert task.id in updated_tasks
        assert updated_tasks[task.id]["status"] == TaskStatus.DONE


# ---------------------------------------------------------------------------
# 12. TestGates — extended (BLOCK vs WARN patterns)
# ---------------------------------------------------------------------------

class TestGatesExtended:
    def test_validate_prompt_blocks_rm_rf_root(self):
        """'rm -rf /' produces a [BLOCK] issue."""
        from brain.gates import validate_prompt, has_blockers
        issues = validate_prompt("Please run rm -rf / to clean up")
        assert has_blockers(issues)
        assert any("[BLOCK]" in i for i in issues)

    def test_validate_prompt_blocks_drop_database(self):
        """'drop database' produces a [BLOCK] issue."""
        from brain.gates import validate_prompt, has_blockers
        issues = validate_prompt("Execute drop database production")
        assert has_blockers(issues)

    def test_validate_prompt_blocks_force_push_main(self):
        """'force push to main' produces a [BLOCK] issue."""
        from brain.gates import validate_prompt, has_blockers
        issues = validate_prompt("Do a force push to main branch")
        assert has_blockers(issues)

    def test_validate_prompt_warns_but_no_block(self):
        """'rm -rf /tmp/old' warns but does not block (no root/home path)."""
        from brain.gates import validate_prompt, has_blockers
        issues = validate_prompt("Run rm -rf /tmp/old-build")
        assert len(issues) >= 1
        assert not has_blockers(issues)


# ---------------------------------------------------------------------------
# 13. TestSessionPermissions
# ---------------------------------------------------------------------------

class TestSessionPermissions:
    def test_build_cmd_skip_permissions(self):
        """permission_mode='skip' adds --dangerously-skip-permissions."""
        from brain.session import _build_claude_cmd
        cmd = _build_claude_cmd("test prompt", "/tmp/proj", permission_mode="skip")
        assert "--dangerously-skip-permissions" in cmd
        assert "--permission-mode" not in cmd

    def test_build_cmd_default_no_flag(self):
        """permission_mode='default' adds no permission flags."""
        from brain.session import _build_claude_cmd
        cmd = _build_claude_cmd("test prompt", "/tmp/proj", permission_mode="default")
        assert "--dangerously-skip-permissions" not in cmd
        assert "--permission-mode" not in cmd

    def test_build_cmd_plan_mode(self):
        """permission_mode='plan' adds --permission-mode plan."""
        from brain.session import _build_claude_cmd
        cmd = _build_claude_cmd("test prompt", "/tmp/proj", permission_mode="plan")
        assert "--permission-mode plan" in cmd
        assert "--dangerously-skip-permissions" not in cmd

    def test_run_session_sync_passes_permission(self):
        """run_session_sync passes permission_mode to _build_claude_cmd."""
        from brain.session import run_session_sync
        with patch("brain.session.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout="output")
            run_session_sync("/tmp", "test", permission_mode="plan")
        cmd = mock_run.call_args[0][0][2]  # bash -c <cmd>
        assert "--permission-mode plan" in cmd


# ---------------------------------------------------------------------------
# 14. TestBriefingMemory
# ---------------------------------------------------------------------------

class TestBriefingMemory:
    @pytest.fixture(autouse=True)
    def _setup_db(self, tmp_path):
        self.db_path = str(tmp_path / "test_tasks.db")

    @patch("brain.queue.load_projects", return_value={})
    def test_mark_briefing_shown(self, mock_projects):
        """mark_briefing_shown stores timestamp in meta table."""
        from brain.queue import init_db, mark_briefing_shown
        init_db(self.db_path)
        mark_briefing_shown(self.db_path)

        import sqlite3
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT value FROM meta WHERE key = 'last_briefing_at'").fetchone()
        conn.close()
        assert row is not None
        assert len(row["value"]) > 0  # ISO datetime string

    @patch("brain.queue.load_projects", return_value={})
    def test_summary_filters_by_last_briefing(self, mock_projects):
        """Tasks completed before last briefing are excluded."""
        from brain.models import TaskStatus
        from brain.queue import add_task, get_overnight_summary, init_db, mark_briefing_shown, update_task

        init_db(self.db_path)

        # Add and complete a task
        t1 = add_task("Old task", db_path=self.db_path)
        update_task(t1.id, db_path=self.db_path, status=TaskStatus.DONE, result="Done")

        # Mark briefing shown (after t1 completed)
        mark_briefing_shown(self.db_path)

        # Add and complete a NEW task
        t2 = add_task("New task", db_path=self.db_path)
        update_task(t2.id, db_path=self.db_path, status=TaskStatus.DONE, result="Also done")

        # Summary should only include the new task
        summary = get_overnight_summary(self.db_path)
        assert summary["done"] == 1
        assert len(summary["tasks_done"]) == 1
        assert summary["tasks_done"][0].id == t2.id

    @patch("brain.queue.load_projects", return_value={})
    def test_summary_no_briefing_shows_all(self, mock_projects):
        """Without a previous briefing, all tasks are shown."""
        from brain.models import TaskStatus
        from brain.queue import add_task, get_overnight_summary, init_db, update_task

        init_db(self.db_path)
        t1 = add_task("Task 1", db_path=self.db_path)
        t2 = add_task("Task 2", db_path=self.db_path)
        update_task(t1.id, db_path=self.db_path, status=TaskStatus.DONE, result="Done")
        update_task(t2.id, db_path=self.db_path, status=TaskStatus.DONE, result="Done")

        summary = get_overnight_summary(self.db_path)
        assert summary["done"] == 2


# ---------------------------------------------------------------------------
# 16. TestCodeReviewProcess — Multi-Agent Code Review Integration
# ---------------------------------------------------------------------------

class TestCodeReviewProcess:
    """Tests for the code review process integration across all execution paths."""

    def test_enrichment_rule_has_code_review_flag(self):
        """EnrichmentRule has include_code_review defaulting to True."""
        from brain.models import EnrichmentRule
        rule = EnrichmentRule(task_type="test")
        assert rule.include_code_review is True

    def test_enrichment_rule_code_review_false(self):
        """EnrichmentRule respects include_code_review=False."""
        from brain.models import EnrichmentRule
        rule = EnrichmentRule(task_type="research", include_code_review=False)
        assert rule.include_code_review is False

    def test_parse_rule_yaml_defaults_code_review_true(self):
        """YAML rule without include_code_review defaults to True."""
        from brain.enricher import _parse_rule_yaml
        rule = _parse_rule_yaml({"task_type": "test"})
        assert rule.include_code_review is True

    def test_parse_rule_yaml_code_review_false(self):
        """YAML rule with include_code_review: false is respected."""
        from brain.enricher import _parse_rule_yaml
        rule = _parse_rule_yaml({"task_type": "research", "include_code_review": False})
        assert rule.include_code_review is False

    def test_build_enriched_prompt_includes_code_review(self):
        """_build_enriched_prompt includes Code Safety Process when enabled."""
        from brain.enricher import _build_enriched_prompt
        from brain.models import EnrichmentRule, ProjectContext
        ctx = ProjectContext(project_name="testproject", project_path="/tmp")
        rule = EnrichmentRule(task_type="code-fix", include_code_review=True)
        result = _build_enriched_prompt("fix something", ctx, rule, "")
        assert "Code Safety Process" in result
        assert "Impact Analysis" in result
        assert "Stability Agent" in result
        assert "Architecture Agent" in result
        assert "Regression Agent" in result
        assert "testproject" in result  # Template variable substituted

    def test_build_enriched_prompt_skips_code_review_when_disabled(self):
        """_build_enriched_prompt skips Code Safety Process when disabled."""
        from brain.enricher import _build_enriched_prompt
        from brain.models import EnrichmentRule, ProjectContext
        ctx = ProjectContext(project_name="test", project_path="/tmp")
        rule = EnrichmentRule(task_type="research", include_code_review=False)
        result = _build_enriched_prompt("research something", ctx, rule, "")
        assert "Code Safety Process" not in result

    def test_research_rule_has_code_review_disabled(self):
        """research.yaml has include_code_review: false."""
        from brain.enricher import load_enrichment_rules
        rules = load_enrichment_rules()
        if "research" in rules:
            assert rules["research"].include_code_review is False

    def test_code_fix_rule_has_code_review_enabled(self):
        """code-fix.yaml has include_code_review: true (default)."""
        from brain.enricher import load_enrichment_rules
        rules = load_enrichment_rules()
        if "code-fix" in rules:
            assert rules["code-fix"].include_code_review is True

    def test_code_fix_rule_has_caller_check_post_action(self):
        """code-fix.yaml includes caller verification post_action."""
        from brain.enricher import load_enrichment_rules
        rules = load_enrichment_rules()
        if "code-fix" in rules:
            actions_text = " ".join(rules["code-fix"].post_actions)
            assert "callers" in actions_text.lower()


class TestImpactAnalysisQuestions:
    """Tests for the impact analysis review questions."""

    def test_no_questions_for_empty_files(self):
        """No impact questions when no files changed."""
        from brain.review import _build_impact_analysis_questions
        questions = _build_impact_analysis_questions([], "/tmp")
        assert questions == []

    def test_python_files_trigger_caller_question(self):
        """Changed Python files produce caller verification question."""
        from brain.review import _build_impact_analysis_questions
        questions = _build_impact_analysis_questions(["brain/enricher.py"], "/tmp")
        assert len(questions) >= 1
        assert any("callers" in q.lower() or "importers" in q.lower() for q in questions)

    def test_config_files_trigger_consumer_question(self):
        """Changed config/schema files produce consumer verification question."""
        from brain.review import _build_impact_analysis_questions
        questions = _build_impact_analysis_questions(["config/settings.yaml"], "/tmp")
        assert any("config/schema" in q.lower() or "consumer" in q.lower() for q in questions)

    def test_many_files_trigger_big_picture_question(self):
        """More than 2 changed files produce big-picture question."""
        from brain.review import _build_impact_analysis_questions
        questions = _build_impact_analysis_questions(
            ["a.py", "b.py", "c.py"], "/tmp"
        )
        assert any("better" in q.lower() for q in questions)

    def test_single_non_python_file_no_caller_question(self):
        """Single non-Python file does not produce caller question."""
        from brain.review import _build_impact_analysis_questions
        questions = _build_impact_analysis_questions(["style.css"], "/tmp")
        assert not any("callers" in q.lower() for q in questions)


class TestAgentReviewIntegration:
    """Tests for the daemon/agent path review integration."""

    def test_run_agent_returns_review_questions(self):
        """run_agent returns review questions in 'review_questions' (not blocking 'questions')."""
        from brain.agents.base import run_agent
        from brain.models import AgentType, EnrichedPrompt, Task

        task = Task(
            id="t1", description="fix auth bug",
            agent_type=AgentType.CODER, project_path="/tmp",
        )
        enriched = EnrichedPrompt(
            original_input="fix auth bug",
            enriched_prompt="enriched fix auth bug",
            task_type="code-fix",
        )

        with patch("brain.agents.base.run_session_sync", return_value="mock output"), \
             patch("brain.review.build_review_questions", return_value=["Did you run tests?"]), \
             patch("brain.observer.observe_output"):
            result = run_agent(task, enriched, config={"model": "opus"})

        assert result["questions"] == []  # No blocking questions
        assert "review_questions" in result
        assert "Did you run tests?" in result["review_questions"]

    def test_post_process_sets_task_questions(self):
        """BaseAgent.post_process() populates task.questions with review questions."""
        from brain.agents.base import BaseAgent
        from brain.models import AgentType, Task

        task = Task(
            id="t1", description="fix bug",
            agent_type=AgentType.CODER, project_path="/tmp",
        )
        agent = BaseAgent(config={"model": "opus"})

        with patch("brain.observer.observe_output"), \
             patch("brain.review.build_review_questions", return_value=["Q1?", "Q2?"]):
            agent.post_process(task, "some output")

        assert task.questions == ["Q1?", "Q2?"]
