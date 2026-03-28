"""Shared data models for geofrey — used across all modules.

Central definitions so all components (enricher, session manager,
task queue, agents, briefing) work against the same contracts.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path


# --- Task Queue Models ---

class TaskStatus(Enum):
    """Status of a task in the queue."""
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    NEEDS_INPUT = "needs_input"
    FAILED = "failed"


class TaskPriority(Enum):
    """Priority levels for tasks."""
    LOW = 1
    NORMAL = 2
    HIGH = 3
    URGENT = 4


class AgentType(Enum):
    """Types of agents that can execute tasks."""
    CODER = "coder"
    RESEARCHER = "researcher"
    CONTENT = "content"
    DOCUMENTER = "documenter"


@dataclass
class Task:
    """A task in geofrey's queue."""
    id: str
    description: str                          # User's original input
    agent_type: AgentType = AgentType.CODER
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority = TaskPriority.NORMAL
    project: str | None = None                # Project name from registry
    project_path: str | None = None           # Resolved path
    created_at: datetime = field(default_factory=datetime.now)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    result: str | None = None                 # Output/summary when done
    error: str | None = None                  # Error message if failed
    questions: list[str] = field(default_factory=list)  # Questions for user
    depends_on: list[str] = field(default_factory=list) # Task IDs


# --- Context Models ---

@dataclass
class ProjectContext:
    """Gathered context for a project."""
    project_name: str
    project_path: str
    git_branch: str = ""
    git_status: str = ""                      # Changed files summary
    recent_commits: str = ""                  # Last 5 commits
    diff_scope: str = ""                      # "backend: 3 files, tests: 2 files"
    claude_md: str = ""                       # Project's CLAUDE.md content
    architecture: str = ""                    # Architecture doc if exists
    session_learnings: str = ""               # Recent learnings for this project
    decision_context: str = ""                # Formatted decision warnings for prompt
    claude_code_context: str = ""             # Relevant Claude Code best practices
    personal_context: str = ""                # User profile for personalized prompts


@dataclass
class EnrichedPrompt:
    """The result of prompt enrichment."""
    original_input: str                       # What the user typed
    enriched_prompt: str                      # The full prompt for Claude Code
    context: ProjectContext | None = None     # The context that was gathered
    task_type: str = "code-fix"               # Detected task type
    post_actions: list[str] = field(default_factory=list)  # What to do after session


# --- Session Models ---

class SessionStatus(Enum):
    """Status of a Claude Code session."""
    STARTING = "starting"
    RUNNING = "running"
    PLAN_PHASE = "plan_phase"
    EXEC_PHASE = "exec_phase"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Session:
    """A managed Claude Code session."""
    id: str
    task_id: str | None = None                # Link to task queue
    project_path: str = ""
    model: str = "opus"
    tmux_session: str = ""                    # tmux session name
    status: SessionStatus = SessionStatus.STARTING
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: datetime | None = None


# --- Briefing Models ---

@dataclass
class BriefingItem:
    """A single item in the morning briefing."""
    category: str                             # "done", "approval", "input", "status"
    title: str
    details: str = ""
    task_id: str | None = None
    actions: list[str] = field(default_factory=list)  # Available actions


@dataclass
class MorningBriefing:
    """The morning briefing for the user."""
    generated_at: datetime = field(default_factory=datetime.now)
    done: list[BriefingItem] = field(default_factory=list)
    needs_approval: list[BriefingItem] = field(default_factory=list)
    needs_input: list[BriefingItem] = field(default_factory=list)
    project_status: list[BriefingItem] = field(default_factory=list)


# --- Enrichment Rule Models ---

@dataclass
class EnrichmentRule:
    """A rule that defines what context to gather for a task type."""
    task_type: str
    include_git_status: bool = True
    include_recent_commits: bool = True
    include_claude_md: bool = True
    include_architecture: bool = False
    include_session_learnings: bool = True
    include_dach_context: bool = False
    include_diff_scope: bool = True
    include_decision_context: bool = True     # Decisions always relevant
    include_claude_code_context: bool = True  # Claude Code best practices
    include_personal_context: bool = True    # User profile always included
    post_actions: list[str] = field(default_factory=list)
    prompt_suffix: str = ""                   # Always appended to prompt


@dataclass
class Decision:
    """A recorded architectural/design decision with dependencies."""
    id: str
    title: str
    status: str = "active"                    # active | superseded | reverted | deprecated
    date: str = ""
    project: str = ""
    category: str = "architecture"            # architecture | implementation | tooling | convention | security | design
    description: str = ""
    rationale: str = ""
    change_warning: str = ""                  # Note to future Claude: what NOT to do
    scope: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    depends_on: list[str] = field(default_factory=list)
    enables: list[str] = field(default_factory=list)
    conflicts_with: list[str] = field(default_factory=list)
    supersedes: list[str] = field(default_factory=list)


@dataclass
class ConversationTurn:
    """A single turn in geofrey's conversation with the user."""
    role: str                                 # "user" | "geofrey"
    text: str
    project: str | None = None
    task_type: str | None = None
    result_summary: str | None = None
    files_changed: list[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.now)
