"""Prompt Enrichment Engine — enrich user prompts with automatic context.

Takes a raw user prompt and enriches it with project context, architecture,
session learnings, and task-specific instructions based on enrichment rules.
"""

from pathlib import Path

import yaml

from brain.context_gatherer import gather_dach_context, gather_decision_context, gather_project_context
from brain.models import EnrichedPrompt, EnrichmentRule, ProjectContext


# --- Default Rules (fallback when no YAML files exist) ---

_DEFAULT_RULES: dict[str, EnrichmentRule] = {
    "code-fix": EnrichmentRule(
        task_type="code-fix",
        include_git_status=True,
        include_recent_commits=True,
        include_claude_md=True,
        include_architecture=False,
        include_session_learnings=True,
        include_dach_context=False,
        include_diff_scope=True,
        post_actions=[
            "Run existing tests to verify the fix",
            "Document the root cause in a brief comment",
        ],
        prompt_suffix="Investigate root cause before fixing. Do not just patch symptoms.",
    ),
    "feature": EnrichmentRule(
        task_type="feature",
        include_git_status=True,
        include_recent_commits=True,
        include_claude_md=True,
        include_architecture=True,
        include_session_learnings=True,
        include_dach_context=False,
        include_diff_scope=True,
        post_actions=[
            "Add or update tests for the new feature",
            "Update architecture docs if structure changed",
            "Update CLAUDE.md if new patterns introduced",
        ],
        prompt_suffix="Follow existing codebase patterns and conventions.",
    ),
    "refactor": EnrichmentRule(
        task_type="refactor",
        include_git_status=True,
        include_recent_commits=True,
        include_claude_md=True,
        include_architecture=True,
        include_session_learnings=True,
        include_dach_context=False,
        include_diff_scope=True,
        post_actions=[
            "Run ALL tests after each change to ensure no regressions",
            "Preserve existing behavior - no functional changes",
        ],
        prompt_suffix="Preserve existing behavior. Run tests after each change.",
    ),
    "review": EnrichmentRule(
        task_type="review",
        include_git_status=True,
        include_recent_commits=True,
        include_claude_md=True,
        include_architecture=True,
        include_session_learnings=True,
        include_dach_context=True,
        include_diff_scope=True,
        post_actions=[
            "Produce a structured report with severity levels (critical/high/medium/low)",
        ],
        prompt_suffix="Focus on bugs, security, DSGVO compliance, code quality, test coverage.",
    ),
    "research": EnrichmentRule(
        task_type="research",
        include_git_status=False,
        include_recent_commits=False,
        include_claude_md=False,
        include_architecture=False,
        include_session_learnings=True,
        include_dach_context=True,
        include_diff_scope=False,
        post_actions=[
            "Structure findings clearly with concrete examples",
            "Save key findings for future reference",
        ],
        prompt_suffix="Include DACH-specific context (Austrian/German regulations) where relevant.",
    ),
    "security": EnrichmentRule(
        task_type="security",
        include_git_status=True,
        include_recent_commits=True,
        include_claude_md=True,
        include_architecture=True,
        include_session_learnings=True,
        include_dach_context=True,
        include_diff_scope=True,
        post_actions=[
            "Produce structured report with severity levels (critical/high/medium/low)",
            "Check OWASP Top 10, DSGVO/GDPR, NIS2 compliance",
        ],
        prompt_suffix="Include DACH regulatory context (Austrian data protection law, DSGVO, NIS2).",
    ),
    "doc-sync": EnrichmentRule(
        task_type="doc-sync",
        include_git_status=True,
        include_recent_commits=True,
        include_claude_md=True,
        include_architecture=True,
        include_session_learnings=False,
        include_dach_context=False,
        include_diff_scope=True,
        post_actions=[
            "NEVER delete documentation content - only update, add, or flag conflicts",
            "Update project-journal.md if it exists",
            "Verify changelog reflects recent changes",
        ],
        prompt_suffix="Cross-reference code changes against documentation. Update stale docs.",
    ),
}


def _parse_rule_yaml(data: dict) -> EnrichmentRule:
    """Parse a YAML dict into an EnrichmentRule dataclass."""
    return EnrichmentRule(
        task_type=data.get("task_type", "code-fix"),
        include_git_status=data.get("include_git_status", True),
        include_recent_commits=data.get("include_recent_commits", True),
        include_claude_md=data.get("include_claude_md", True),
        include_architecture=data.get("include_architecture", False),
        include_session_learnings=data.get("include_session_learnings", True),
        include_dach_context=data.get("include_dach_context", False),
        include_diff_scope=data.get("include_diff_scope", True),
        include_decision_context=data.get("include_decision_context", True),
        post_actions=data.get("post_actions", []),
        prompt_suffix=data.get("prompt_suffix", ""),
    )


def load_enrichment_rules() -> dict[str, EnrichmentRule]:
    """Load enrichment rules from YAML files in brain/rules/.

    Falls back to hardcoded defaults if no YAML files exist or
    if loading fails.

    Returns:
        Dict of task_type -> EnrichmentRule.
    """
    rules_dir = Path(__file__).parent / "rules"
    rules: dict[str, EnrichmentRule] = {}

    if rules_dir.is_dir():
        for yaml_file in sorted(rules_dir.glob("*.yaml")):
            try:
                with open(yaml_file) as f:
                    data = yaml.safe_load(f)
                if data and isinstance(data, dict) and "task_type" in data:
                    rule = _parse_rule_yaml(data)
                    rules[rule.task_type] = rule
            except (yaml.YAMLError, OSError):
                continue

    if not rules:
        return dict(_DEFAULT_RULES)

    return rules


def _build_enriched_prompt(
    user_input: str,
    context: ProjectContext,
    rule: EnrichmentRule,
    dach_context: str,
) -> str:
    """Build the enriched prompt string from context and rule.

    Only includes sections that have actual content.
    """
    sections: list[str] = []

    # Task section (always present)
    sections.append(f"## Task\n{user_input}")

    # Prompt suffix from rule
    if rule.prompt_suffix:
        sections.append(f"{rule.prompt_suffix}")

    # Project context section
    project_parts: list[str] = []
    if rule.include_git_status and context.git_branch:
        project_parts.append(f"Branch: {context.git_branch}")
    if rule.include_git_status and context.git_status:
        project_parts.append(f"Recent changes:\n{context.git_status}")
    if rule.include_recent_commits and context.recent_commits:
        project_parts.append(f"Recent commits:\n{context.recent_commits}")
    if rule.include_diff_scope and context.diff_scope:
        project_parts.append(f"Diff scope: {context.diff_scope}")

    if project_parts:
        sections.append("## Project Context\n" + "\n".join(project_parts))

    # Architecture / CLAUDE.md section
    arch_parts: list[str] = []
    if rule.include_architecture and context.architecture:
        arch_parts.append(context.architecture)
    elif rule.include_claude_md and context.claude_md:
        arch_parts.append(context.claude_md)

    if arch_parts:
        sections.append("## Architecture\n" + "\n\n".join(arch_parts))

    # Session learnings
    if rule.include_session_learnings and context.session_learnings:
        sections.append(
            "## Known Context from Previous Sessions\n" + context.session_learnings
        )

    # Decision context
    if rule.include_decision_context and context.decision_context:
        sections.append("## Active Decisions\n" + context.decision_context)

    # DACH context
    if rule.include_dach_context and dach_context:
        sections.append("## DACH Context\n" + dach_context)

    # Post-actions as requirements
    if rule.post_actions:
        actions_text = "\n".join(f"- {action}" for action in rule.post_actions)
        sections.append(f"## Requirements\nAfter completing:\n{actions_text}")

    return "\n\n".join(sections)


def enrich_prompt(
    user_input: str,
    project_name: str,
    project_path: str,
    task_type: str,
    config: dict,
) -> EnrichedPrompt:
    """Enrich a user prompt with automatic project context.

    Gathers context based on the enrichment rule for the given task_type,
    then builds a structured prompt with all relevant sections.

    Args:
        user_input: The raw user prompt.
        project_name: Human-readable project name.
        project_path: Absolute path to the project root.
        task_type: Detected task type (e.g. "code-fix", "feature").
        config: Config dict with paths and model settings.

    Returns:
        EnrichedPrompt with original input, enriched prompt, context,
        task type, and post-actions.
    """
    # Load rules and get the matching one
    rules = load_enrichment_rules()
    rule = rules.get(task_type, _DEFAULT_RULES.get(task_type, _DEFAULT_RULES["code-fix"]))

    # Gather project context (respects rule flags internally for ChromaDB queries)
    context = gather_project_context(project_path, project_name, config)

    # Gather decision context if needed
    if rule.include_decision_context:
        context.decision_context = gather_decision_context(
            project_path, project_name, user_input, config
        )

    # Gather DACH context if needed
    dach_context = ""
    if rule.include_dach_context:
        dach_context = gather_dach_context(config)

    # Build the enriched prompt
    enriched = _build_enriched_prompt(user_input, context, rule, dach_context)

    return EnrichedPrompt(
        original_input=user_input,
        enriched_prompt=enriched,
        context=context,
        task_type=task_type,
        post_actions=list(rule.post_actions),
    )
