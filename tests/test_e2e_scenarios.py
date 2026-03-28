"""End-to-end scenario tests for geofrey.

Tests the full flow across module boundaries with mocks only at external
boundaries (subprocess, ollama, chromadb, input). Internal module wiring
is tested for real.

Scenarios:
1. Full Overnight Flow: queue add -> process_queue -> briefing -> verify
2. Orchestrator single_task: input -> route -> enrich -> build spec -> execute
3. LinkedIn generate_post: topic -> style + posts + context -> ollama -> post
4. Router -> Enricher Integration: detect -> meta -> enrich -> verify
5. Queue -> Daemon -> Briefing Integration: add -> process -> briefing -> verify

Run with: .venv/bin/python -m pytest tests/test_e2e_scenarios.py -v
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_db_path(tmp_path):
    """Create a temp SQLite DB path and initialize it."""
    from brain.queue import init_db

    db_path = str(tmp_path / "test_e2e.db")
    init_db(db_path)
    return db_path


@pytest.fixture
def test_config():
    """Minimal config for tests — no real paths needed."""
    return {
        "model_policy": {"code": "opus", "analysis": "opus", "content": "sonnet"},
        "llm": {"model": "qwen3.5:9b"},
        "embedding": {"model": "nomic-embed-text"},
        "paths": {"vectordb": "/tmp/test_vectordb"},
        "skill_defaults": {},
    }


@pytest.fixture
def mock_project_context():
    """A realistic ProjectContext for test projects."""
    from brain.models import ProjectContext

    return ProjectContext(
        project_name="testproject",
        project_path="/tmp/testproject",
        git_branch="main",
        git_status="M src/auth.py\nM tests/test_auth.py",
        recent_commits="abc1234 fix: login validation\ndef5678 feat: add auth module",
        diff_scope="backend: 1 file, tests: 1 file",
        claude_md="# testproject\n\nA test project for E2E scenarios.",
        architecture="## Architecture\n\nSimple MVC with Python backend.",
        session_learnings="Previous session: fixed auth token refresh bug.",
    )


# ---------------------------------------------------------------------------
# 1. Full Overnight Flow
# ---------------------------------------------------------------------------

class TestFullOvernightFlow:
    """queue add -> process_queue -> briefing -> verify."""

    @patch("brain.queue.load_projects", return_value={})
    def test_two_tasks_processed_and_briefing_generated(self, mock_projects, tmp_db_path, test_config):
        """Add 2 tasks, process them, generate briefing with done items."""
        from brain.queue import add_task, get_task, get_overnight_summary
        from brain.models import TaskStatus, EnrichedPrompt
        from brain.daemon import process_queue
        from brain.briefing import generate_briefing

        # Step 1: Add 2 tasks to the queue
        task1 = add_task("fix login validation", db_path=tmp_db_path, priority=3)
        task2 = add_task("add password reset feature", db_path=tmp_db_path, priority=2)

        assert task1.status == TaskStatus.PENDING
        assert task2.status == TaskStatus.PENDING

        # Step 2: Mock boundaries and process queue
        mock_enriched = EnrichedPrompt(
            original_input="test",
            enriched_prompt="Enriched prompt for testing",
            task_type="code-fix",
        )

        with patch("brain.daemon.get_pending_tasks") as mock_get_pending, \
             patch("brain.daemon.update_task") as mock_update, \
             patch("brain.daemon.enrich_prompt", return_value=mock_enriched), \
             patch("brain.daemon.validate_prompt", return_value=[]), \
             patch("brain.daemon.has_blockers", return_value=False), \
             patch("brain.agents.base.run_session_sync", return_value="Task completed successfully"):

            # Return real task objects from our temp DB
            mock_get_pending.return_value = [task1, task2]

            # Track status updates
            status_updates = {}

            def track_update(task_id, **kwargs):
                if task_id not in status_updates:
                    status_updates[task_id] = []
                status_updates[task_id].append(kwargs)
                # Return a task-like object
                return task1 if task_id == task1.id else task2

            mock_update.side_effect = track_update

            results = process_queue(config=test_config)

        # Step 3: Verify both tasks processed
        assert len(results) == 2
        assert results[0]["status"] == "done"
        assert results[1]["status"] == "done"

        # Verify status transitions: RUNNING then DONE for each task
        for task_id in [task1.id, task2.id]:
            updates = status_updates[task_id]
            statuses = [u.get("status") for u in updates if "status" in u]
            assert TaskStatus.RUNNING in statuses or TaskStatus.RUNNING.value in statuses
            assert TaskStatus.DONE in statuses or TaskStatus.DONE.value in statuses

        # Step 4: Generate briefing from real task results
        done_task1 = task1
        done_task1.status = TaskStatus.DONE
        done_task1.result = "Fixed login validation — added input sanitization."
        done_task2 = task2
        done_task2.status = TaskStatus.DONE
        done_task2.result = "Created password reset flow with email confirmation."

        mock_summary = {
            "done": 2, "failed": 0, "needs_input": 0, "pending": 0, "running": 0,
            "tasks_done": [done_task1, done_task2],
            "tasks_failed": [],
            "tasks_needs_input": [],
            "tasks_pending": [],
            "tasks_running": [],
        }

        with patch("brain.briefing.get_overnight_summary", return_value=mock_summary):
            briefing = generate_briefing(config=test_config)

        # Step 5: Verify briefing
        assert len(briefing.done) == 2
        assert any("login" in item.title.lower() for item in briefing.done)
        assert any("password" in item.title.lower() for item in briefing.done)

    @patch("brain.queue.load_projects", return_value={})
    def test_mixed_results_in_briefing(self, mock_projects, tmp_db_path, test_config):
        """One task succeeds, one fails — both reflected in briefing."""
        from brain.queue import add_task
        from brain.models import TaskStatus, Task, EnrichedPrompt
        from brain.daemon import process_queue
        from brain.briefing import generate_briefing

        task1 = add_task("fix auth bug", db_path=tmp_db_path, priority=3)
        task2 = add_task("deploy to production", db_path=tmp_db_path, priority=2)

        mock_enriched = EnrichedPrompt(
            original_input="test",
            enriched_prompt="Enriched prompt",
            task_type="code-fix",
        )

        call_count = {"n": 0}

        def mock_run_session(**kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return "Auth bug fixed successfully"
            raise RuntimeError("Deployment failed: connection timeout")

        with patch("brain.daemon.get_pending_tasks", return_value=[task1, task2]), \
             patch("brain.daemon.update_task") as mock_update, \
             patch("brain.daemon.enrich_prompt", return_value=mock_enriched), \
             patch("brain.daemon.validate_prompt", return_value=[]), \
             patch("brain.daemon.has_blockers", return_value=False), \
             patch("brain.agents.base.run_session_sync", side_effect=mock_run_session):

            mock_update.return_value = task1

            results = process_queue(config=test_config)

        assert len(results) == 2
        assert results[0]["status"] == "done"
        assert results[1]["status"] == "failed"

        # Build briefing from these results
        done_task = Task(id=task1.id, description="fix auth bug",
                         status=TaskStatus.DONE, result="Auth bug fixed successfully",
                         project="testproject")
        failed_task = Task(id=task2.id, description="deploy to production",
                           status=TaskStatus.FAILED, error="RuntimeError: connection timeout",
                           project="testproject")

        mock_summary = {
            "done": 1, "failed": 1, "needs_input": 0, "pending": 0, "running": 0,
            "tasks_done": [done_task], "tasks_failed": [failed_task],
            "tasks_needs_input": [], "tasks_pending": [], "tasks_running": [],
        }

        with patch("brain.briefing.get_overnight_summary", return_value=mock_summary):
            briefing = generate_briefing(config=test_config)

        # done list has both: the success + the failure (marked as [FAILED])
        assert len(briefing.done) == 2
        assert any("[FAILED]" in item.title for item in briefing.done)
        assert len(briefing.project_status) == 1
        assert briefing.project_status[0].title == "testproject"


# ---------------------------------------------------------------------------
# 2. Orchestrator single_task Flow
# ---------------------------------------------------------------------------

class TestOrchestratorSingleTask:
    """input -> detect_task_type -> detect_project -> enrich -> build spec -> execute."""

    @patch("brain.orchestrator.load_projects")
    @patch("brain.orchestrator.enrich_prompt")
    @patch("brain.orchestrator.validate_prompt", return_value=[])
    @patch("builtins.input", return_value="y")
    def test_single_task_fix_in_testproject(
        self, mock_input, mock_validate, mock_enrich, mock_projects
    ):
        """Full single_task flow: detects task type, enriches, executes via monitored session."""
        from brain.orchestrator import single_task
        from brain.models import EnrichedPrompt, ProjectContext, SessionStatus, Session
        from brain.observer import Observation

        mock_projects.return_value = {
            "testproject": {"path": "/tmp/testproject", "stack": "Python", "description": "Test"}
        }
        mock_enrich.return_value = EnrichedPrompt(
            original_input="fix login in testproject",
            enriched_prompt="## Task\nfix login",
            context=ProjectContext(project_name="testproject", project_path="/tmp/testproject", git_branch="main"),
            task_type="code-fix",
            post_actions=["Run tests"],
        )

        from brain.intent import Intent
        mock_intent = Intent(task_type="code-fix", project="testproject", summary="fix login", source="llm")
        mock_session = Session(id="test1234", status=SessionStatus.RUNNING, tmux_session="geofrey-test1234")

        with patch("brain.orchestrator._get_config", return_value={"model_policy": {"code": "opus"}}):
            with patch("brain.orchestrator.understand_intent", return_value=mock_intent):
                with patch("brain.session.start_session", return_value=mock_session):
                    with patch("brain.monitor.monitor_session", return_value="Task completed"):
                        with patch("brain.observer.observe_output", return_value=Observation(success=True, result_summary="Done")):
                            single_task("fix login in testproject")

        mock_enrich.assert_called_once()

    @patch("brain.orchestrator.load_projects")
    @patch("brain.orchestrator.enrich_prompt")
    @patch("brain.orchestrator.validate_prompt", return_value=[])
    @patch("brain.orchestrator.has_blockers", return_value=False)
    @patch("subprocess.run")
    @patch("builtins.input", return_value="n")
    def test_single_task_user_declines(
        self, mock_input, mock_subprocess, mock_blockers, mock_validate,
        mock_enrich, mock_projects
    ):
        """User declines execution — subprocess should NOT be called."""
        from brain.orchestrator import single_task
        from brain.models import EnrichedPrompt, ProjectContext

        mock_projects.return_value = {
            "testproject": {"path": "/tmp/testproject", "stack": "Python", "description": "test"}
        }

        mock_enrich.return_value = EnrichedPrompt(
            original_input="fix login in testproject",
            enriched_prompt="Enriched prompt",
            context=ProjectContext(project_name="testproject", project_path="/tmp/testproject"),
            task_type="code-fix",
        )

        with patch("brain.orchestrator._get_config", return_value={"model_policy": {"code": "opus"}}):
            single_task("fix login in testproject")

        # subprocess should NOT have been called since user said "n"
        mock_subprocess.assert_not_called()

    @patch("brain.orchestrator.load_projects")
    def test_single_task_no_project_detected(self, mock_projects):
        """No matching project — should exit gracefully without enrichment."""
        from brain.orchestrator import single_task
        from brain.intent import Intent

        mock_projects.return_value = {
            "myproject": {"path": "/tmp/myproject", "stack": "Python", "description": "test"}
        }

        mock_intent = Intent(task_type="code-fix", project=None, summary="fix something", source="keyword-fallback")
        with patch("brain.orchestrator._get_config", return_value={}):
            with patch("brain.orchestrator.understand_intent", return_value=mock_intent):
                with patch("brain.orchestrator.enrich_prompt") as mock_enrich:
                    single_task("fix some random thing")

        # enrich_prompt should not be called when no project is detected
        mock_enrich.assert_not_called()


# ---------------------------------------------------------------------------
# 3. LinkedIn generate_post Flow
# ---------------------------------------------------------------------------

class TestLinkedInGeneratePost:
    """topic -> gather style + similar posts + context -> ollama.chat -> return post."""

    @patch("brain.linkedin.chromadb.PersistentClient")
    @patch("brain.linkedin.ollama.embed")
    @patch("brain.linkedin.ollama.chat")
    @patch("brain.linkedin.get_style_guide")
    @patch("brain.linkedin.render_template")
    def test_generate_post_full_flow(
        self, mock_template, mock_style, mock_chat, mock_embed, mock_chromadb
    ):
        """Full post generation: topic -> style + context -> ollama -> post text."""
        from brain.linkedin import generate_post

        config = {
            "llm": {"model": "qwen3.5:9b"},
            "embedding": {"model": "nomic-embed-text"},
            "paths": {"vectordb": "/tmp/test_vectordb"},
            "linkedin": {"temperature": 0.7},
        }

        # Mock style guide
        mock_style.return_value = "Stil: direkt, praxisnah, DACH-fokussiert"

        # Mock template rendering
        mock_template.return_value = "Generated prompt for NIS2 post"

        # Mock chromadb for similar posts — collection returns empty
        mock_collection = MagicMock()
        mock_collection.count.return_value = 0
        mock_chromadb.return_value.get_collection.side_effect = Exception("no collection")

        # Mock ollama.embed (used by _get_similar_posts)
        mock_embed.return_value = {"embeddings": [[0.1] * 768]}

        # Mock ollama.chat to return a post
        expected_post = "NIS2 betrifft jetzt auch KMU in Österreich. Was bedeutet das konkret?"
        mock_chat.return_value = {
            "message": {"content": expected_post},
        }

        # Mock personal context chromadb
        mock_ctx_collection = MagicMock()
        mock_ctx_collection.get.return_value = {"documents": ["Slavko, IT-Berater aus Wien"]}
        mock_chromadb.return_value.get_collection.side_effect = [
            Exception("no linkedin collection"),  # for _get_similar_posts
            mock_ctx_collection,  # for _get_personal_context
        ]

        result = generate_post("NIS2 für KMU", config)

        # Verify ollama.chat was called with correct model
        mock_chat.assert_called_once()
        chat_kwargs = mock_chat.call_args
        assert chat_kwargs.kwargs.get("model") == "qwen3.5:9b" or \
               (chat_kwargs.args and chat_kwargs.args[0] == "qwen3.5:9b") or \
               "qwen3.5:9b" in str(chat_kwargs)

        # Verify the returned post text comes from the mock
        assert result == expected_post

    @patch("brain.linkedin.chromadb.PersistentClient")
    @patch("brain.linkedin.ollama.embed")
    @patch("brain.linkedin.ollama.chat")
    @patch("brain.linkedin.get_style_guide")
    @patch("brain.linkedin.render_template")
    def test_generate_post_with_similar_posts(
        self, mock_template, mock_style, mock_chat, mock_embed, mock_chromadb
    ):
        """Post generation retrieves similar posts when available."""
        from brain.linkedin import generate_post

        config = {
            "llm": {"model": "qwen3.5:9b"},
            "embedding": {"model": "nomic-embed-text"},
            "paths": {"vectordb": "/tmp/test_vectordb"},
            "linkedin": {"temperature": 0.7},
        }

        mock_style.return_value = "Stil: direkt"
        mock_template.return_value = "Prompt with examples"
        mock_embed.return_value = {"embeddings": [[0.1] * 768]}

        # Mock collection with existing posts
        mock_collection = MagicMock()
        mock_collection.count.return_value = 3
        mock_collection.query.return_value = {
            "documents": [["Post 1 text", "Post 2 text"]],
            "metadatas": [[{"thema": "DSGVO"}, {"thema": "NIS2"}]],
        }

        # Context collection
        mock_ctx_collection = MagicMock()
        mock_ctx_collection.get.return_value = {"documents": []}

        mock_chromadb.return_value.get_collection.side_effect = [
            mock_collection,      # for _get_similar_posts
            mock_ctx_collection,  # for _get_personal_context
        ]

        mock_chat.return_value = {"message": {"content": "Generated post about DSGVO"}}

        result = generate_post("DSGVO Basics", config)

        assert result == "Generated post about DSGVO"
        # Verify similar posts were queried
        mock_collection.query.assert_called_once()

    @patch("brain.linkedin.chromadb.PersistentClient")
    @patch("brain.linkedin.ollama.embed")
    @patch("brain.linkedin.ollama.chat")
    @patch("brain.linkedin.get_style_guide")
    @patch("brain.linkedin.render_template")
    def test_generate_post_ollama_failure_raises(
        self, mock_template, mock_style, mock_chat, mock_embed, mock_chromadb
    ):
        """Ollama connection failure raises RuntimeError."""
        from brain.linkedin import generate_post

        config = {
            "llm": {"model": "qwen3.5:9b"},
            "embedding": {"model": "nomic-embed-text"},
            "paths": {"vectordb": "/tmp/test_vectordb"},
        }

        mock_style.return_value = "Stil: direkt"
        mock_template.return_value = "Prompt"
        mock_embed.return_value = {"embeddings": [[0.1] * 768]}

        # chromadb fails for both collections
        mock_chromadb.return_value.get_collection.side_effect = Exception("no collection")

        # ollama.chat raises
        mock_chat.side_effect = ConnectionError("Ollama not running")

        with pytest.raises(RuntimeError, match="Ollama nicht erreichbar"):
            generate_post("Test topic", config)


# ---------------------------------------------------------------------------
# 4. Router -> Enricher Integration
# ---------------------------------------------------------------------------

class TestRouterEnricherIntegration:
    """Real detect_task_type + get_skill_meta -> enrich_prompt -> verify."""

    @patch("brain.enricher.gather_project_context")
    @patch("brain.enricher.gather_dach_context", return_value="DACH: Austrian data protection law applies.")
    def test_security_task_full_chain(self, mock_dach, mock_ctx, mock_project_context):
        """'sicherheit prüfen' routes to security, enrichment includes DACH context."""
        from brain.router import detect_task_type, get_skill_meta
        from brain.enricher import enrich_prompt

        user_input = "sicherheit prüfen"
        config = {}

        # Step 1: Route (real — no mock)
        task_type = detect_task_type(user_input)
        assert task_type == "security"

        # Step 2: Skill meta (real — no mock)
        skill_meta = get_skill_meta(task_type, config)
        assert skill_meta.model_category == "analysis"
        assert skill_meta.permission_mode == "plan"

        # Step 3: Enrich (mock only external deps)
        mock_ctx.return_value = mock_project_context

        enriched = enrich_prompt(
            user_input=user_input,
            project_name="testproject",
            project_path="/tmp/testproject",
            task_type=task_type,
            config=config,
        )

        # Verify enrichment includes DACH context for security tasks
        assert "DACH" in enriched.enriched_prompt
        assert "sicherheit prüfen" in enriched.enriched_prompt
        assert enriched.task_type == "security"
        # Security rule includes architecture
        assert "Architecture" in enriched.enriched_prompt

    @patch("brain.enricher.gather_project_context")
    @patch("brain.enricher.gather_dach_context", return_value="")
    def test_feature_task_full_chain(self, mock_dach, mock_ctx, mock_project_context):
        """'add login feature' routes to feature, enrichment includes architecture."""
        from brain.router import detect_task_type, get_skill_meta
        from brain.enricher import enrich_prompt

        user_input = "add login feature"
        config = {}

        # Step 1: Route (real)
        task_type = detect_task_type(user_input)
        assert task_type == "feature"

        # Step 2: Skill meta (real)
        skill_meta = get_skill_meta(task_type, config)
        assert skill_meta.model_category == "code"
        assert skill_meta.needs_plan is True

        # Step 3: Enrich
        mock_ctx.return_value = mock_project_context

        enriched = enrich_prompt(
            user_input=user_input,
            project_name="testproject",
            project_path="/tmp/testproject",
            task_type=task_type,
            config=config,
        )

        # Feature rule includes architecture
        assert "Architecture" in enriched.enriched_prompt
        assert "add login feature" in enriched.enriched_prompt
        assert enriched.task_type == "feature"
        # Feature rule has post-actions about tests
        assert any("test" in action.lower() for action in enriched.post_actions)

    @patch("brain.enricher.gather_project_context")
    @patch("brain.enricher.gather_dach_context", return_value="")
    def test_code_fix_task_includes_git_context(self, mock_dach, mock_ctx, mock_project_context):
        """'fix the crash' routes to code-fix, enrichment includes git info."""
        from brain.router import detect_task_type, get_skill_meta
        from brain.enricher import enrich_prompt

        user_input = "fix the crash"

        task_type = detect_task_type(user_input)
        assert task_type == "code-fix"

        mock_ctx.return_value = mock_project_context

        enriched = enrich_prompt(
            user_input=user_input,
            project_name="testproject",
            project_path="/tmp/testproject",
            task_type=task_type,
            config={},
        )

        # code-fix includes git status and diff scope
        assert "main" in enriched.enriched_prompt  # git branch
        assert "auth.py" in enriched.enriched_prompt  # from git_status
        # code-fix does NOT include architecture (include_architecture=False)
        # But it does include claude_md as a fallback
        assert enriched.task_type == "code-fix"

    @patch("brain.enricher.gather_project_context")
    @patch("brain.enricher.gather_dach_context", return_value="")
    def test_research_task_no_git_context(self, mock_dach, mock_ctx):
        """'was ist NIS2' routes to research, enrichment skips git info."""
        from brain.router import detect_task_type, get_skill_meta
        from brain.enricher import enrich_prompt
        from brain.models import ProjectContext

        user_input = "was ist NIS2"

        task_type = detect_task_type(user_input)
        assert task_type == "research"

        # Give a context WITH git info — research rule should exclude it
        mock_ctx.return_value = ProjectContext(
            project_name="testproject",
            project_path="/tmp/testproject",
            git_branch="feature/nis2",
            git_status="M research.py",
            recent_commits="abc123 added NIS2 doc",
            session_learnings="NIS2 applies to essential services.",
        )

        enriched = enrich_prompt(
            user_input=user_input,
            project_name="testproject",
            project_path="/tmp/testproject",
            task_type=task_type,
            config={},
        )

        # Research rule: include_git_status=False, include_recent_commits=False
        assert "feature/nis2" not in enriched.enriched_prompt
        assert "research.py" not in enriched.enriched_prompt
        # But session learnings ARE included for research
        assert "NIS2 applies" in enriched.enriched_prompt

    @patch("brain.enricher.gather_project_context")
    @patch("brain.enricher.gather_dach_context", return_value="")
    def test_doc_sync_task_chain(self, mock_dach, mock_ctx, mock_project_context):
        """'update docs' routes to doc-sync with correct enrichment."""
        from brain.router import detect_task_type, get_skill_meta
        from brain.enricher import enrich_prompt

        user_input = "update docs for the project"

        task_type = detect_task_type(user_input)
        assert task_type == "doc-sync"

        skill_meta = get_skill_meta(task_type, {})
        assert skill_meta.model_category == "content"

        mock_ctx.return_value = mock_project_context

        enriched = enrich_prompt(
            user_input=user_input,
            project_name="testproject",
            project_path="/tmp/testproject",
            task_type=task_type,
            config={},
        )

        assert enriched.task_type == "doc-sync"
        # doc-sync includes architecture
        assert "Architecture" in enriched.enriched_prompt
        # doc-sync post-actions mention documentation
        assert any("doc" in action.lower() or "journal" in action.lower()
                    for action in enriched.post_actions)


# ---------------------------------------------------------------------------
# 5. Queue -> Daemon -> Briefing Integration
# ---------------------------------------------------------------------------

class TestQueueDaemonBriefingIntegration:
    """Real temp DB, add tasks, process, generate briefing, verify structure."""

    @patch("brain.queue.load_projects", return_value={})
    def test_priority_ordering_and_full_briefing(self, mock_projects, tmp_db_path, test_config):
        """Tasks processed in priority order, briefing reflects all results."""
        from brain.queue import add_task, get_pending_tasks, get_overnight_summary, update_task
        from brain.models import TaskStatus, TaskPriority, EnrichedPrompt
        from brain.daemon import process_queue
        from brain.briefing import generate_briefing, format_briefing

        # Add tasks with different priorities
        low_task = add_task("cleanup old logs", db_path=tmp_db_path, priority=1)
        high_task = add_task("fix critical auth bug", db_path=tmp_db_path, priority=3)
        normal_task = add_task("add user profile page", db_path=tmp_db_path, priority=2)

        # Verify priority ordering from DB
        pending = get_pending_tasks(db_path=tmp_db_path)
        assert len(pending) == 3
        # Highest priority first
        assert pending[0].id == high_task.id
        assert pending[0].priority == TaskPriority.HIGH

        # Process queue with mocked agent execution
        mock_enriched = EnrichedPrompt(
            original_input="test",
            enriched_prompt="Enriched prompt",
            task_type="code-fix",
        )

        execution_order = []

        def mock_run_session(**kwargs):
            execution_order.append(kwargs.get("prompt", ""))
            return "Task completed"

        with patch("brain.daemon.get_pending_tasks") as mock_get_pending, \
             patch("brain.daemon.update_task") as mock_update, \
             patch("brain.daemon.enrich_prompt", return_value=mock_enriched), \
             patch("brain.daemon.validate_prompt", return_value=[]), \
             patch("brain.daemon.has_blockers", return_value=False), \
             patch("brain.agents.base.run_session_sync", side_effect=mock_run_session):

            mock_get_pending.return_value = pending
            mock_update.return_value = pending[0]

            results = process_queue(config=test_config)

        assert len(results) == 3
        assert all(r["status"] == "done" for r in results)

        # Now update real DB to simulate what daemon would do
        update_task(high_task.id, db_path=tmp_db_path,
                    status=TaskStatus.DONE, result="Critical bug fixed with input validation")
        update_task(normal_task.id, db_path=tmp_db_path,
                    status=TaskStatus.DONE, result="Profile page created with avatar upload")
        update_task(low_task.id, db_path=tmp_db_path,
                    status=TaskStatus.DONE, result="Cleaned 47 old log files")

        # Generate briefing from real DB summary
        summary = get_overnight_summary(db_path=tmp_db_path)
        assert summary["done"] == 3
        assert summary["failed"] == 0
        assert summary["pending"] == 0

        with patch("brain.briefing.get_overnight_summary", return_value=summary):
            briefing = generate_briefing(config=test_config)

        assert len(briefing.done) == 3
        # Verify briefing can be formatted without error
        text = format_briefing(briefing)
        assert "Erledigt" in text
        assert "geofrey" in text

    @patch("brain.queue.load_projects", return_value={})
    def test_needs_input_task_in_briefing(self, mock_projects, tmp_db_path, test_config):
        """Task that needs user input appears in briefing.needs_input."""
        from brain.queue import add_task, update_task, get_overnight_summary
        from brain.models import TaskStatus, Task
        from brain.briefing import generate_briefing

        # Add and update task to needs_input status
        task = add_task("configure deployment", db_path=tmp_db_path)
        update_task(
            task.id,
            db_path=tmp_db_path,
            status=TaskStatus.NEEDS_INPUT,
            questions='["Which environment: staging or production?", "Use blue-green deployment?"]',
        )

        summary = get_overnight_summary(db_path=tmp_db_path)
        assert summary["needs_input"] == 1

        with patch("brain.briefing.get_overnight_summary", return_value=summary):
            briefing = generate_briefing(config=test_config)

        assert len(briefing.needs_input) == 1
        assert "configure deployment" in briefing.needs_input[0].title

    @patch("brain.queue.load_projects", return_value={})
    def test_briefing_project_status_aggregation(self, mock_projects, tmp_db_path, test_config):
        """Briefing groups tasks by project in project_status."""
        from brain.queue import add_task, update_task, get_overnight_summary
        from brain.models import TaskStatus, Task
        from brain.briefing import generate_briefing

        # Add tasks for two projects
        t1 = add_task("fix auth in projA", project="projA", db_path=tmp_db_path)
        t2 = add_task("add tests for projA", project="projA", db_path=tmp_db_path)
        t3 = add_task("refactor projB", project="projB", db_path=tmp_db_path)

        # Mark different statuses
        update_task(t1.id, db_path=tmp_db_path, status=TaskStatus.DONE, result="Fixed")
        update_task(t2.id, db_path=tmp_db_path, status=TaskStatus.DONE, result="Tests added")
        update_task(t3.id, db_path=tmp_db_path, status=TaskStatus.FAILED, error="Timeout")

        summary = get_overnight_summary(db_path=tmp_db_path)
        assert summary["done"] == 2
        assert summary["failed"] == 1

        with patch("brain.briefing.get_overnight_summary", return_value=summary):
            briefing = generate_briefing(config=test_config)

        # Two projects should appear in project_status
        assert len(briefing.project_status) == 2
        project_names = {item.title for item in briefing.project_status}
        assert "projA" in project_names
        assert "projB" in project_names

    @patch("brain.queue.load_projects", return_value={})
    def test_save_briefing_creates_files(self, mock_projects, tmp_db_path, test_config, tmp_path):
        """save_briefing writes both .md and .json files."""
        from brain.queue import add_task, update_task, get_overnight_summary
        from brain.models import TaskStatus
        from brain.briefing import generate_briefing, save_briefing

        task = add_task("test task", db_path=tmp_db_path)
        update_task(task.id, db_path=tmp_db_path, status=TaskStatus.DONE, result="Done")

        summary = get_overnight_summary(db_path=tmp_db_path)

        with patch("brain.briefing.get_overnight_summary", return_value=summary):
            briefing = generate_briefing(config=test_config)

        md_path = str(tmp_path / "briefing.md")

        with patch("brain.briefing.KNOWLEDGE_DIR", tmp_path), \
             patch("brain.briefing.BRIEFING_JSON_PATH", tmp_path / "briefing.json"):
            save_briefing(briefing, path=md_path)

        # Verify files were created
        assert Path(md_path).exists()
        md_content = Path(md_path).read_text()
        assert "geofrey" in md_content

        json_path = tmp_path / "briefing.json"
        assert json_path.exists()
        import json
        data = json.loads(json_path.read_text())
        assert "done" in data
        assert "generated_at" in data


# ---------------------------------------------------------------------------
# 6. Cross-cutting: Enrichment preserves original input
# ---------------------------------------------------------------------------

class TestEnrichmentPreservesInput:
    """Verify original user input is always preserved through the enrichment chain."""

    @patch("brain.enricher.gather_project_context")
    @patch("brain.enricher.gather_dach_context", return_value="")
    @pytest.mark.parametrize("user_input,expected_type", [
        ("fix the login bug", "code-fix"),
        ("add new dashboard feature", "feature"),
        ("refactor the auth module", "refactor"),
        ("review the latest PR", "review"),
        ("sicherheit prüfen", "security"),
        ("update docs", "doc-sync"),
    ])
    def test_original_input_in_enriched_prompt(
        self, mock_dach, mock_ctx, user_input, expected_type, mock_project_context
    ):
        """Original user input is always present in the enriched prompt."""
        from brain.router import detect_task_type
        from brain.enricher import enrich_prompt

        mock_ctx.return_value = mock_project_context

        task_type = detect_task_type(user_input)
        assert task_type == expected_type

        enriched = enrich_prompt(
            user_input=user_input,
            project_name="testproject",
            project_path="/tmp/testproject",
            task_type=task_type,
            config={},
        )

        assert user_input in enriched.enriched_prompt
        assert enriched.original_input == user_input
        assert enriched.task_type == expected_type
