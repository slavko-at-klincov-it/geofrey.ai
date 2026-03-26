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
            max_turns=30,
            max_budget_usd=5.0,
            permission_mode="default",
        )
        cmd = build_command(spec)

        assert cmd.startswith("claude")
        assert "-p" in cmd
        assert "--cwd" in cmd
        assert "--model" in cmd
        assert "opus" in cmd
        assert "--max-turns" in cmd
        assert "30" in cmd
        assert "--max-budget-usd" in cmd
        assert "5.00" in cmd
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
                    "max_budget_usd": 20.0,
                    "max_turns": 100,
                    "permission_mode": "plan",
                    "needs_plan": False,
                },
            },
        }
        meta = get_skill_meta("feature", config)
        assert meta.name == "feature"
        assert meta.model_category == "sonnet"
        assert meta.max_budget_usd == 20.0
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
        assert meta.max_budget_usd == 5.0
        assert meta.max_turns == 30
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

        with patch("brain.briefing.get_overnight_summary", return_value={"tasks": [], "projects": {}}):
            with patch("brain.briefing.load_config", return_value={}):
                briefing = generate_briefing(config={})

        assert isinstance(briefing, MorningBriefing)
        assert briefing.done == []
        assert briefing.needs_approval == []
        assert briefing.needs_input == []

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
        assert spec.max_turns == 30
        assert spec.max_budget_usd == 5.0
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
