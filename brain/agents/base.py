"""Base agent — defines the agent interface and factory dispatcher.

All agent types currently route through Claude Code CLI via
run_session_sync. The differentiation between agent types lives
in prompt enrichment, not in execution mechanics.
"""

import logging
from pathlib import Path

from brain.models import AgentType, EnrichedPrompt, Task
from brain.session import run_session_sync

logger = logging.getLogger("geofrey.agent")


class BaseAgent:
    """Base class for geofrey agents.

    Subclasses can override execute() for custom execution logic
    and post_process() for custom result handling.
    """

    def __init__(self, config: dict) -> None:
        """Store configuration for the agent."""
        self.config = config

    def execute(self, task: Task, enriched_prompt: EnrichedPrompt) -> str:
        """Execute a task with the given enriched prompt.

        Default implementation runs Claude Code synchronously.
        Subclasses should override for specialized behavior.
        """
        project_path = task.project_path or "."
        model = self.config.get("model", "opus")
        max_turns = self.config.get("max_turns", 50)
        permission_mode = self.config.get("permission_mode", "skip")

        return run_session_sync(
            project_path=project_path,
            prompt=enriched_prompt.enriched_prompt,
            model=model,
            max_turns=max_turns,
            permission_mode=permission_mode,
        )

    def post_process(self, task: Task, output: str) -> None:
        """Post-process task output: observe result + extract session learnings.

        1. Observe: LLM triages output (success/failure/follow-up)
        2. Learn: Extract session learnings from JSONL
        Fail-safe: errors are logged, never raised.
        """
        # 1. Observe output
        try:
            from brain.observer import observe_output
            observation = observe_output(output, task.description, self.config)
            logger.info(
                f"Task {task.id[:8]} observation: success={observation.success}, "
                f"summary={observation.result_summary}, "
                f"follow_up={observation.follow_up_needed}"
            )
        except Exception as e:
            logger.warning(f"Observation failed for task {task.id[:8]}: {e}")

        # 2. Extract session learnings
        if not task.project_path:
            return

        try:
            from knowledge.intelligence import extract_session
            from knowledge.sessions import CLAUDE_PROJECTS_DIR, get_project_slug

            project_path = Path(task.project_path).expanduser().resolve()
            slug = get_project_slug(str(project_path))
            project_dir = CLAUDE_PROJECTS_DIR / slug

            if not project_dir.exists():
                logger.debug(f"No Claude projects dir for {slug}")
                return

            jsonls = sorted(
                project_dir.glob("*.jsonl"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if not jsonls:
                return

            latest = jsonls[0]
            project_name = task.project or project_path.name

            logger.info(f"Extracting learnings from session {latest.stem[:8]} for {project_name}")
            extract_session(latest, project_name.lower(), self.config)

        except Exception as e:
            logger.warning(f"Post-process failed for task {task.id[:8]}: {e}")


def run_agent(task: Task, enriched_prompt: EnrichedPrompt, config: dict) -> dict:
    """Factory function — pick the right agent, execute, and post-process.

    Currently all agent types use BaseAgent. As specialized agents
    are added, this function will dispatch to the correct subclass.

    Returns dict with 'result' (str) and 'questions' (list).
    """
    agent_map: dict[AgentType, type[BaseAgent]] = {
        AgentType.CODER: BaseAgent,
        AgentType.RESEARCHER: BaseAgent,
        AgentType.CONTENT: BaseAgent,
        AgentType.DOCUMENTER: BaseAgent,
    }

    agent_cls = agent_map.get(task.agent_type, BaseAgent)
    agent = agent_cls(config)

    result = agent.execute(task, enriched_prompt)
    agent.post_process(task, output=result)

    return {"result": result, "questions": []}
