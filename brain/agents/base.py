"""Base agent — defines the agent interface and factory dispatcher.

All agent types currently route through Claude Code CLI via
run_session_sync. The differentiation between agent types lives
in prompt enrichment, not in execution mechanics.
"""

from brain.models import AgentType, EnrichedPrompt, Task
from brain.session import run_session_sync


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

        return run_session_sync(
            project_path=project_path,
            prompt=enriched_prompt.enriched_prompt,
            model=model,
        )

    def post_process(self, task: Task, output: str) -> None:
        """Post-process task output. Default: extract session learnings.

        Subclasses can override to add custom post-processing.
        """
        # Future: call session intelligence to extract learnings
        pass


def run_agent(task: Task, enriched_prompt: EnrichedPrompt, config: dict) -> str:
    """Factory function — pick the right agent, execute, and post-process.

    Currently all agent types use BaseAgent. As specialized agents
    are added, this function will dispatch to the correct subclass.
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

    return result
