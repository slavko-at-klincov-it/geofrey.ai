"""geofrey brain — orchestrates prompt enrichment, command building, and session execution.

New architecture (Prompt Enrichment Engine):

  1. User types input
  2. detect_task_type() → task_type (keyword-based, deterministic)
  3. get_skill_meta() → skill defaults (model, budget, turns, plan mode)
  4. detect_project() → project_name, project_path
  5. enrich_prompt() → Python gathers context and builds a structured prompt
     (replaces old LLM-based prompt generation entirely)
  6. resolve_model() → select Claude Code model from config policy
  7. Build CommandSpec with enriched prompt + skill defaults
  8. Two-phase (plan → execute) or direct execution

Python handles ALL deterministic logic. No LLM call needed for prompt
construction — the enricher gathers git state, architecture docs, session
learnings, DACH context, and post-actions automatically based on task type.
"""

import subprocess
from pathlib import Path

import yaml

from rich.console import Console

from knowledge.store import load_config
from brain.enricher import enrich_prompt
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
) -> tuple[CommandSpec | None, str]:
    """Core enrichment flow shared by interactive() and single_task().

    Returns:
        Tuple of (CommandSpec or None, enriched_prompt_text).
        CommandSpec is None when no project was detected.
    """
    # 1. Route task
    task_type = detect_task_type(user_input)
    skill_meta = get_skill_meta(task_type, config)

    # 2. Detect project
    project_name, project_path = detect_project(user_input)

    if not project_path or not project_name:
        print(f"\n  Task type: {task_type}")
        print("  (No project detected — specify a project name to generate a command)")
        return None, ""

    # 3. Enrich prompt (Python gathers all context, no LLM call)
    enriched = enrich_prompt(user_input, project_name, project_path, task_type, config)

    # 4. Resolve model
    model = resolve_model(skill_meta.model_category, config)

    # 5. Show enrichment summary (dim, non-blocking — like thinking mode)
    _show_enrichment_summary(
        user_input, task_type, skill_meta, model,
        enriched.enriched_prompt, enriched.context,
    )

    # 6. Build CommandSpec
    spec = CommandSpec(
        prompt=enriched.enriched_prompt,
        project_path=project_path,
        model=model,
        max_turns=skill_meta.max_turns,
        max_budget_usd=skill_meta.max_budget_usd,
        permission_mode=skill_meta.permission_mode,
    )

    return spec, enriched.enriched_prompt


def interactive():
    """Run geofrey in interactive chat mode.

    Flow per iteration:
      1. User types input
      2. detect_task_type → keyword routing
      3. get_skill_meta → model/budget/turns/plan defaults
      4. detect_project → project name + path
      5. enrich_prompt → Python gathers context, builds structured prompt
      6. Show enriched prompt preview (first 500 chars)
      7. resolve_model → select Claude Code model
      8. Build CommandSpec with enriched prompt + skill defaults
      9. Two-phase or direct execution
    """
    print("=" * 50)
    print("  geofrey — Personal AI Assistant")
    print("  Type 'quit' to exit")
    print("=" * 50)

    config = _get_config()

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

        print("\n  Processing...\n")

        spec, prompt_text = _run_enrichment_flow(user_input, config)
        if spec is None:
            continue

        # Execute: two-phase or direct
        skill_meta = get_skill_meta(detect_task_type(user_input), config)
        if skill_meta.needs_plan and project_has_code(spec.project_path):
            run_two_phase(spec, prompt_text)
        else:
            execute_spec(spec)


def single_task(task: str):
    """Process a single task using the enrichment flow."""
    config = _get_config()
    print(f"  Task: {task}\n")

    spec, prompt_text = _run_enrichment_flow(task, config)
    if spec is None:
        return

    # Execute: two-phase or direct
    skill_meta = get_skill_meta(detect_task_type(task), config)
    if skill_meta.needs_plan and project_has_code(spec.project_path):
        run_two_phase(spec, prompt_text)
    else:
        execute_spec(spec)
