"""geofrey brain — orchestrates intent understanding, enrichment, and execution.

Architecture:

  1. User types input
  2. LLM Intent Layer (Qwen3.5) → understand intent, detect project, resolve ambiguity
     Falls back to keyword routing if Ollama unavailable.
  3. get_skill_meta() → skill defaults (model, budget, turns, plan mode)
  4. enrich_prompt() → Python gathers context deterministically
  5. resolve_model() → select Claude Code model from config policy
  6. Build CommandSpec with enriched prompt + skill defaults
  7. Two-phase (plan → execute) or direct execution

LLM handles DYNAMIC logic: intent understanding, ambiguity, follow-ups.
Python handles DETERMINISTIC logic: context gathering, prompt building,
CLI construction, safety gates, decision injection.
"""

import subprocess
from pathlib import Path

import yaml

from rich.console import Console

from knowledge.store import load_config
from brain.enricher import enrich_prompt
from brain.intent import understand_intent, Intent
from brain.router import detect_task_type, get_skill_meta, TASK_KEYWORDS, _keyword_matches
from brain.command import CommandSpec, build_command, resolve_model, project_has_code
from brain.gates import validate_prompt, format_gate_results, has_blockers

_console = Console()


def _get_config(config: dict | None = None) -> dict:
    """Return config, loading from file if not provided."""
    return config if config is not None else load_config()


def load_projects() -> dict:
    """Load project registry from config/projects.yaml."""
    projects_file = Path(__file__).parent.parent / "config" / "projects.yaml"
    if not projects_file.exists():
        return {}
    with open(projects_file, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("projects", {})


def _show_enrichment_summary(
    user_input: str,
    task_type: str,
    skill_meta,
    model: str,
    enriched_prompt: str,
    context,
) -> None:
    """Show a compact, dim summary of what geofrey enriched.

    Displayed like thinking mode — transparent but not blocking.
    """
    # Matched keywords
    input_lower = user_input.lower()
    matched_kws = []
    for kw in TASK_KEYWORDS.get(task_type, []):
        if _keyword_matches(kw, input_lower):
            matched_kws.append(kw)

    # Sections in the enriched prompt
    sections = [line[3:] for line in enriched_prompt.split("\n") if line.startswith("## ")]

    # Decision count
    decision_lines = [l for l in enriched_prompt.split("\n") if l.strip().startswith("**DEC-")]
    n_decisions = len(decision_lines)

    # Build summary
    _console.print()
    _console.print("  [dim]─── geofrey enrichment ───[/dim]")
    _console.print(f"  [dim]routing:[/dim]  {task_type} [dim](keywords: {', '.join(matched_kws) or 'none — default'})[/dim]")
    _console.print(f"  [dim]model:[/dim]    {model} [dim]| budget: ${skill_meta.max_budget_usd:.0f} | turns: {skill_meta.max_turns} | perm: {skill_meta.permission_mode}[/dim]")

    if skill_meta.needs_plan:
        _console.print(f"  [dim]mode:[/dim]     [yellow]two-phase[/yellow] [dim](plan → approve → execute)[/dim]")

    _console.print(f"  [dim]context:[/dim]  {', '.join(sections)}")

    if n_decisions > 0:
        _console.print(f"  [dim]decisions:[/dim] {n_decisions} active [dim](injected as warnings)[/dim]")

    ratio = len(enriched_prompt) / max(len(user_input), 1)
    _console.print(f"  [dim]prompt:[/dim]   {len(user_input)} → {len(enriched_prompt)} chars [dim](x{ratio:.0f})[/dim]")
    _console.print("  [dim]──────────────────────────[/dim]")


def detect_project(user_message: str) -> tuple[str | None, str | None]:
    """Detect which project the user is referring to.

    Returns:
        Tuple of (project_name, project_path), or (None, None) if no match.
    """
    projects = load_projects()
    for name, info in projects.items():
        if name.lower() in user_message.lower():
            return name, info["path"]
    return None, None


def execute_spec(spec: CommandSpec) -> bool:
    """Validate, confirm, and execute a CommandSpec.

    Validates prompt content for safety, shows the assembled command,
    asks for user confirmation, then executes.
    """
    command = build_command(spec)

    print(f"\n  Command to execute:")
    print(f"  {command}")

    issues = validate_prompt(spec.prompt)
    if issues:
        print(f"\n{format_gate_results(issues)}")
        if has_blockers(issues):
            print("\n  BLOCKED: Fix critical issues above before executing.")
            return False

    confirm = input("\n  Execute? [y/N]: ").strip().lower()
    if confirm == "y":
        print("\n  Running...\n")
        result = subprocess.run(["bash", "-c", command], shell=False)
        return result.returncode == 0
    print("  Skipped.")
    return False


def run_two_phase(spec: CommandSpec, prompt_text: str) -> bool:
    """Run two-phase execution: plan first, then execute.

    Phase 1: Read-only analysis with --permission-mode plan
    Phase 2: Full execution after user confirms the plan
    """
    print("\n  Plan-Phase: Analysiere Codebase (read-only)...")

    plan_spec = CommandSpec(
        prompt=f"Analyze the codebase and create a detailed implementation plan for the following task. Do NOT make any changes. Only read, analyze, and output a structured plan.\n\nTask: {prompt_text}",
        project_path=spec.project_path,
        model=spec.model,
        max_turns=15,
        max_budget_usd=2.0,
        permission_mode="plan",
    )

    plan_command = build_command(plan_spec)
    print(f"  {plan_command}")

    confirm = input("\n  Start Plan-Phase? [y/N]: ").strip().lower()
    if confirm != "y":
        print("  Skipped.")
        return False

    print("\n  Running Plan-Phase...\n")
    plan_result = subprocess.run(
        ["bash", "-c", plan_command],
        shell=False,
        capture_output=True,
        text=True,
    )

    plan_output = plan_result.stdout
    if plan_output:
        print("  === PLAN OUTPUT ===")
        print(plan_output[:3000])
        if len(plan_output) > 3000:
            print("  ... (truncated)")
        print("  === END PLAN ===\n")

    if plan_result.returncode != 0:
        print(f"  Plan-Phase failed (exit code {plan_result.returncode})")
        if plan_result.stderr:
            print(f"  {plan_result.stderr[:500]}")
        return False

    # Phase 2: Execute with plan context
    confirm = input("  Execute based on this plan? [y/N]: ").strip().lower()
    if confirm != "y":
        print("  Skipped.")
        return False

    execute_prompt = prompt_text
    if plan_output:
        execute_prompt += f"\n\n=== IMPLEMENTATION PLAN ===\n{plan_output[:2000]}\n\nFollow this plan precisely."

    exec_spec = CommandSpec(
        prompt=execute_prompt,
        project_path=spec.project_path,
        model=spec.model,
        max_turns=spec.max_turns,
        max_budget_usd=spec.max_budget_usd,
        permission_mode="default",
    )

    return execute_spec(exec_spec)


def _run_enrichment_flow(
    user_input: str,
    config: dict,
    conversation_history: list[str] | None = None,
) -> tuple[CommandSpec | None, str, Intent | None]:
    """Core enrichment flow shared by interactive() and single_task().

    Uses LLM Intent Layer (Qwen3.5) to understand what the user wants,
    then Python enrichment to gather context deterministically.

    Returns:
        Tuple of (CommandSpec or None, enriched_prompt_text, Intent or None).
        CommandSpec is None when project not detected or clarification needed.
    """
    # 1. LLM Intent Understanding (falls back to keyword routing if Ollama unavailable)
    intent = understand_intent(user_input, config, conversation_history)

    # Show intent summary
    _console.print()
    _console.print("  [dim]─── geofrey intent ───[/dim]")
    _console.print(f"  [dim]understood:[/dim] {intent.summary}")
    _console.print(f"  [dim]type:[/dim]       {intent.task_type} [dim]({intent.source})[/dim]")
    if intent.project:
        _console.print(f"  [dim]project:[/dim]    {intent.project}")
    if intent.approach:
        _console.print(f"  [dim]approach:[/dim]   {intent.approach}")
    if intent.relevant_files:
        _console.print(f"  [dim]files:[/dim]      {', '.join(intent.relevant_files)}")
    if intent.subtasks:
        _console.print(f"  [dim]subtasks:[/dim]   {' → '.join(intent.subtasks)}")
    _console.print("  [dim]────────────────────────[/dim]")

    # 2. Handle multi-step tasks — LLM decomposed into subtasks
    if intent.subtasks and len(intent.subtasks) > 1:
        # Resolve project first
        project_name = intent.project
        project_path = None
        if project_name:
            projects = load_projects()
            project_info = projects.get(project_name)
            if project_info:
                project_path = project_info["path"]
        if not project_name:
            project_name, project_path = detect_project(user_input)
        if project_path and project_name:
            _run_subtask_chain(intent.subtasks, project_name, project_path, config, conversation_history)
            return None, "", intent  # Chain handled execution internally
        # Fall through to single-task flow if no project

    # 3. Handle clarification — LLM detected ambiguity
    if intent.clarification:
        _console.print(f"\n  [yellow]geofrey:[/yellow] {intent.clarification}")
        try:
            answer = input("  You: ").strip()
        except (EOFError, KeyboardInterrupt):
            return None, "", intent
        if answer:
            # Re-run with clarification as additional context
            combined = f"{user_input} — {answer}"
            return _run_enrichment_flow(combined, config, conversation_history)
        return None, "", intent

    # 3. Resolve project
    project_name = intent.project
    project_path = None

    if project_name:
        projects = load_projects()
        project_info = projects.get(project_name)
        if project_info:
            project_path = project_info["path"]

    if not project_name:
        # Fallback: try string matching
        project_name, project_path = detect_project(user_input)

    if not project_path or not project_name:
        _console.print(f"\n  [dim]Task type: {intent.task_type}[/dim]")
        _console.print("  [dim](No project detected — specify a project name)[/dim]")
        return None, "", intent

    # 4. Get skill meta
    skill_meta = get_skill_meta(intent.task_type, config)

    # 5. Enrich prompt — use LLM task_brief instead of raw user input if available
    task_input = intent.task_brief if intent.task_brief else user_input
    enriched = enrich_prompt(task_input, project_name, project_path, intent.task_type, config)

    # 6. Resolve model
    model = resolve_model(skill_meta.model_category, config)

    # 7. Show enrichment summary
    _show_enrichment_summary(
        user_input, intent.task_type, skill_meta, model,
        enriched.enriched_prompt, enriched.context,
    )

    # 8. Build CommandSpec
    spec = CommandSpec(
        prompt=enriched.enriched_prompt,
        project_path=project_path,
        model=model,
        max_turns=skill_meta.max_turns,
        max_budget_usd=skill_meta.max_budget_usd,
        permission_mode=skill_meta.permission_mode,
    )

    return spec, enriched.enriched_prompt, intent


def _run_subtask_chain(
    subtasks: list[str],
    project_name: str,
    project_path: str,
    config: dict,
    conversation_history: list[str] | None = None,
) -> None:
    """Execute subtasks sequentially, passing output forward.

    Each subtask runs through the full enrichment pipeline. Output from
    one step becomes context for the next.
    """
    from brain.session import run_session_sync
    from brain.command import resolve_model

    _console.print(f"\n  [yellow]Multi-step task: {len(subtasks)} subtasks[/yellow]")
    previous_output = ""

    for i, subtask in enumerate(subtasks, 1):
        _console.print(f"\n  [yellow]─── Step {i}/{len(subtasks)}: {subtask[:60]} ───[/yellow]")

        # Add previous output as context
        task_input = subtask
        if previous_output:
            task_input += f"\n\nContext from previous step:\n{previous_output[:2000]}"

        # Enrich and build
        task_type = detect_task_type(task_input)
        skill_meta = get_skill_meta(task_type, config)
        enriched = enrich_prompt(task_input, project_name, project_path, task_type, config)
        model = resolve_model(skill_meta.model_category, config)

        _show_enrichment_summary(task_input, task_type, skill_meta, model,
                                 enriched.enriched_prompt, enriched.context)

        spec = CommandSpec(
            prompt=enriched.enriched_prompt,
            project_path=project_path,
            model=model,
            max_turns=skill_meta.max_turns,
            max_budget_usd=skill_meta.max_budget_usd,
            permission_mode=skill_meta.permission_mode,
        )

        if not execute_spec(spec):
            _console.print(f"  [red]Step {i} skipped or failed. Stopping chain.[/red]")
            break

        # Capture output for next step
        previous_output = f"Step {i} ({subtask}) completed."


def interactive():
    """Run geofrey in interactive chat mode with LLM intent understanding.

    Flow per iteration:
      1. User types input
      2. LLM Intent Layer → understand intent, detect project, resolve ambiguity
      3. Python Enrichment → gather context, build structured prompt
      4. Show enrichment summary (transparent, like thinking mode)
      5. Two-phase or direct execution
    """
    print("=" * 50)
    print("  geofrey — Personal AI Assistant")
    print("  Type 'quit' to exit")
    print("=" * 50)

    from brain.models import ConversationTurn

    config = _get_config()
    conversation: list[ConversationTurn] = []

    while True:
        try:
            user_input = input("\n  You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  Bye!")
            break
        if not user_input:
            continue
        if user_input.lower() in ("quit", "exit", "q"):
            print("  Bye!")
            break

        conversation.append(ConversationTurn(role="user", text=user_input))

        # Build conversation history for intent layer
        history = [
            f"{'User' if t.role == 'user' else 'geofrey'}: {t.text}"
            + (f" ({t.task_type}, project={t.project})" if t.task_type else "")
            for t in conversation[-10:]
        ]

        spec, prompt_text, intent = _run_enrichment_flow(user_input, config, history)
        if spec is None:
            if intent:
                conversation.append(ConversationTurn(
                    role="geofrey", text=intent.summary or user_input,
                    project=intent.project, task_type=intent.task_type,
                ))
            continue

        # Track intent for conversation context
        if intent:
            conversation.append(ConversationTurn(
                role="geofrey", text=intent.summary or user_input,
                project=intent.project, task_type=intent.task_type,
            ))

        # Execute: two-phase or direct
        skill_meta = get_skill_meta(intent.task_type if intent else detect_task_type(user_input), config)
        if skill_meta.needs_plan and project_has_code(spec.project_path):
            run_two_phase(spec, prompt_text)
        else:
            execute_spec(spec)


def single_task(task: str):
    """Process a single task using LLM intent + enrichment flow."""
    config = _get_config()
    print(f"  Task: {task}\n")

    spec, prompt_text, intent = _run_enrichment_flow(task, config)
    if spec is None:
        return

    # Execute: two-phase or direct
    skill_meta = get_skill_meta(intent.task_type if intent else detect_task_type(task), config)
    if skill_meta.needs_plan and project_has_code(spec.project_path):
        run_two_phase(spec, prompt_text)
    else:
        execute_spec(spec)
