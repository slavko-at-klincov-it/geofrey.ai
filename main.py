#!/usr/bin/env python3
"""geofrey — Personal AI Assistant."""

import argparse
import sys

from knowledge.store import load_config


def main() -> None:
    """CLI entry point — parse args and dispatch to subcommands."""
    parser = argparse.ArgumentParser(description="geofrey — Personal AI Assistant")
    subparsers = parser.add_subparsers(dest="command")

    # Brain commands
    subparsers.add_parser("chat", help="Interactive chat with geofrey (orchestrator mode)")
    task_parser = subparsers.add_parser("task", help="Single task for geofrey")
    task_parser.add_argument("task_text", help="Task description")

    # LinkedIn generation
    li_parser = subparsers.add_parser("post", help="Generate a LinkedIn post")
    li_parser.add_argument("topic", nargs="?", help="Post topic (optional, will ask if missing)")

    # Knowledge commands
    ingest_parser = subparsers.add_parser("ingest", help="Index documents")
    ingest_parser.add_argument("path", help="Path to documents")
    ingest_parser.add_argument("--collection", default="knowledge")

    subparsers.add_parser("status", help="Show all collections")
    subparsers.add_parser("context-setup", help="Ingest DACH context files")
    subparsers.add_parser("linkedin-ingest", help="Import LinkedIn posts")
    subparsers.add_parser("linkedin-style", help="Show LinkedIn style guide")
    subparsers.add_parser("sessions-ingest", help="Import Claude Code sessions")
    subparsers.add_parser("inbox", help="Process inbox directory")

    hub_parser = subparsers.add_parser("hub-query", help="Query specific collections")
    hub_parser.add_argument("query_text", help="Search query")
    hub_parser.add_argument("--collections", default="knowledge")
    hub_parser.add_argument("--top", type=int, default=5)

    # Session Intelligence
    learn_parser = subparsers.add_parser("learn", help="Extract learnings from Claude Code sessions")
    learn_parser.add_argument("--project", help="Project name filter")
    learn_parser.add_argument("--session", help="Specific session ID (prefix)")
    learn_parser.add_argument("--max", type=int, default=10, help="Max sessions to process")
    learn_parser.add_argument("--reprocess", action="store_true", help="Re-extract existing")

    learnings_parser = subparsers.add_parser("learnings", help="View/search session learnings")
    learnings_parser.add_argument("project", nargs="?", help="Project name")
    learnings_parser.add_argument("--query", help="Search learnings via RAG")

    # Decisions
    dec_parser = subparsers.add_parser("decisions", help="Decision management")
    dec_sub = dec_parser.add_subparsers(dest="dec_action")

    dec_list = dec_sub.add_parser("list", help="List active decisions")
    dec_list.add_argument("--project", help="Project name filter")

    dec_check = dec_sub.add_parser("check", help="Check a task against active decisions")
    dec_check.add_argument("task_desc", help="Task description to check")
    dec_check.add_argument("--project", required=True, help="Project name")

    dec_index = dec_sub.add_parser("index", help="Re-index decisions into ChromaDB")
    dec_index.add_argument("--project", required=True, help="Project name")

    # Projects
    add_proj = subparsers.add_parser("add-project", help="Create and register a new project")
    add_proj.add_argument("name", help="Project name (e.g. mobile-app)")
    add_proj.add_argument("--stack", default="", help="Tech stack (e.g. Python, React)")
    add_proj.add_argument("--description", default="", help="Short description")
    add_proj.add_argument("--no-github", action="store_true", help="Skip GitHub repo creation")
    add_proj.add_argument("--private", action="store_true", help="Make GitHub repo private (default: private)")

    # Skills
    subparsers.add_parser("skills", help="List available task routing skills")

    # Task Queue
    queue_parser = subparsers.add_parser("queue", help="Task queue management")
    queue_sub = queue_parser.add_subparsers(dest="queue_action")

    queue_add = queue_sub.add_parser("add", help="Add a task to the queue")
    queue_add.add_argument("description", help="Task description")
    queue_add.add_argument("--project", help="Project name")
    queue_add.add_argument("--priority", choices=["high", "normal", "low"], default="normal")
    queue_add.add_argument("--agent", choices=["coder", "researcher", "content"], default="coder")

    queue_list = queue_sub.add_parser("list", help="List tasks in the queue")
    queue_list.add_argument("--status", choices=["pending", "running", "done", "failed", "needs_input"])

    queue_process = queue_sub.add_parser("process", help="Process pending tasks")
    queue_process.add_argument("--max", type=int, default=10, help="Max tasks to process")

    # Briefing + Overnight
    subparsers.add_parser("briefing", help="Show the morning briefing")
    subparsers.add_parser("overnight", help="Run the full overnight cycle")
    subparsers.add_parser("install-daemon", help="Print launchd plist for overnight daemon")
    subparsers.add_parser("preflight", help="Run pre-flight checks for autonomous operation")

    # Scripts
    subparsers.add_parser("embed", help="Embed Claude Code knowledge base (--reset, --changed)")

    args, remaining = parser.parse_known_args()
    config = load_config()

    if args.command == "post":
        from brain.linkedin import linkedin_flow
        linkedin_flow(args.topic)

    elif args.command == "chat":
        from brain.orchestrator import interactive
        interactive()

    elif args.command == "task":
        from brain.orchestrator import single_task
        single_task(args.task_text)

    elif args.command == "ingest":
        from knowledge.ingest import ingest
        ingest(args.path, config, collection_name=args.collection)

    elif args.command == "status":
        from knowledge.store import VectorStore
        store = VectorStore(config)
        status = store.status()
        print(f"DB path: {status['db_path']}")
        print(f"Total chunks: {status['total_chunks']}\n")
        for name, count in sorted(status["collections"].items()):
            print(f"  {name}: {count} chunks")

    elif args.command == "context-setup":
        from knowledge.context import ContextManager
        ContextManager(config).ingest_context_files()

    elif args.command == "linkedin-ingest":
        from knowledge.linkedin import ingest_linkedin_posts
        ingest_linkedin_posts(config)

    elif args.command == "linkedin-style":
        from knowledge.linkedin import get_style_guide
        print(get_style_guide(config))

    elif args.command == "sessions-ingest":
        from knowledge.sessions import ingest_sessions
        ingest_sessions(config)

    elif args.command == "inbox":
        from knowledge.sessions import process_inbox
        process_inbox(config)

    elif args.command == "hub-query":
        from knowledge.hub import KnowledgeHub
        hub = KnowledgeHub()
        cols = [c.strip() for c in args.collections.split(",")]
        results = hub.query(args.query_text, collections=cols, top_k=args.top)
        if not results:
            print("No results found.")
        else:
            for i, r in enumerate(results, 1):
                score = 1 - r["distance"]
                print(f"\n{'='*60}")
                print(f"[{i}] {r['source']} ({r['collection']}, score: {score:.3f})")
                print(f"{'='*60}")
                print(r["text"][:500])

    elif args.command == "learn":
        from knowledge.intelligence import extract_all, extract_session
        if args.session:
            # Find specific session file
            from knowledge.sessions import CLAUDE_PROJECTS_DIR
            from knowledge.intelligence import _slug_to_project_name
            found = False
            if not CLAUDE_PROJECTS_DIR.exists():
                print("No Claude Code projects found.")
                sys.exit(1)
            for d in CLAUDE_PROJECTS_DIR.iterdir():
                if not d.is_dir():
                    continue
                for jsonl in d.glob("*.jsonl"):
                    if jsonl.stem.startswith(args.session):
                        project_name = _slug_to_project_name(d.name)
                        extract_session(jsonl, project_name, config)
                        found = True
                        break
                if found:
                    break
            if not found:
                print(f"Session '{args.session}' not found.")
        else:
            extract_all(project=args.project, config=config, max_sessions=args.max, reprocess=args.reprocess)

    elif args.command == "learnings":
        from knowledge.intelligence import view_learnings, query_learnings
        if args.query:
            results = query_learnings(args.query, project=args.project, config=config)
            if not results:
                print("No results found.")
            else:
                for i, r in enumerate(results, 1):
                    score = 1 - r["distance"]
                    print(f"\n{'='*60}")
                    print(f"[{i}] {r.get('project', '?')} / {r.get('category', '?')} (score: {score:.3f})")
                    print(f"{'='*60}")
                    print(r["text"][:500])
        else:
            print(view_learnings(project=args.project, config=config))

    elif args.command == "decisions":
        from knowledge.decisions import load_decisions_from_files, index_decisions
        from brain.decision_checker import check_decision_conflicts

        if args.dec_action == "list":
            decisions_base = __import__("pathlib").Path(config["paths"].get("decisions", "knowledge-base/decisions"))
            if args.project:
                projects = [args.project]
            elif decisions_base.exists():
                projects = [d.name for d in sorted(decisions_base.iterdir()) if d.is_dir()]
            else:
                projects = []

            if not projects:
                print("No decisions found.")
            else:
                for proj in projects:
                    decs = load_decisions_from_files(proj, config)
                    active = [d for d in decs if d.status == "active"]
                    if not active:
                        continue
                    print(f"\n{proj} ({len(active)} active):")
                    for d in active:
                        print(f"  {d.id}  [{d.category:14s}]  {d.title}")
                        if d.change_warning:
                            print(f"         ⚠ {d.change_warning}")

        elif args.dec_action == "check":
            conflicts = check_decision_conflicts(args.task_desc, args.project, [], config)
            if not conflicts:
                print("No conflicts found.")
            else:
                print(f"{len(conflicts)} relevant decision(s):\n")
                for c in conflicts:
                    print(c)
                    print()

        elif args.dec_action == "index":
            decs = load_decisions_from_files(args.project, config)
            count = index_decisions(decs, config)
            print(f"Indexed {count} decisions for {args.project}.")

        else:
            print("Usage: geofrey decisions {list|check|index}")

    elif args.command == "add-project":
        import os
        import subprocess as _sp
        from pathlib import Path as P
        import yaml as _yaml

        projects_file = P(__file__).parent / "config" / "projects.yaml"
        with open(projects_file) as f:
            data = _yaml.safe_load(f) or {}

        projects = data.setdefault("projects", {})
        if args.name in projects:
            print(f"Project '{args.name}' already exists.")
            sys.exit(1)

        # Resolve workspace path from config
        workspace = os.path.expanduser(config.get("workspace", "~/Code"))
        project_path = P(workspace) / args.name
        relative_path = f"~/Code/{args.name}"

        # 1. Create directory
        project_path.mkdir(parents=True, exist_ok=True)
        print(f"  1. Created {project_path}")

        # 2. Git init
        _sp.run(["git", "init"], cwd=project_path, capture_output=True)
        print(f"  2. git init")

        # 3. CLAUDE.md
        claude_md = project_path / "CLAUDE.md"
        desc = args.description or f"{args.name} project"
        stack = args.stack or "TBD"
        claude_md.write_text(
            f"# {args.name}\n\n{desc}\n\n## Tech Stack\n{stack}\n",
            encoding="utf-8",
        )
        print(f"  3. CLAUDE.md created")

        # 4. .gitignore
        gitignore = project_path / ".gitignore"
        if not gitignore.exists():
            gitignore.write_text(
                "__pycache__/\n*.pyc\n.venv/\n.env\n.DS_Store\nnode_modules/\n",
                encoding="utf-8",
            )
        print(f"  4. .gitignore created")

        # 5. Initial commit
        _sp.run(["git", "add", "."], cwd=project_path, capture_output=True)
        _sp.run(
            ["git", "-c", "user.name=geofrey", "-c", "user.email=geofrey@local",
             "commit", "-m", "Initial commit — project scaffolded by geofrey"],
            cwd=project_path, capture_output=True,
        )
        print(f"  5. Initial commit")

        # 6. GitHub repo
        if not args.no_github:
            result = _sp.run(
                ["gh", "repo", "create", args.name, "--private", "--source", str(project_path), "--push"],
                capture_output=True, text=True,
            )
            if result.returncode == 0:
                print(f"  6. GitHub repo created: {result.stdout.strip()}")
            else:
                print(f"  6. GitHub repo creation failed: {result.stderr.strip()}")
                print(f"     (You can create it manually: gh repo create {args.name} --private --source {project_path} --push)")
        else:
            print(f"  6. GitHub repo skipped (--no-github)")

        # 7. Register in projects.yaml
        projects[args.name] = {
            "path": relative_path,
            "stack": stack,
            "description": desc,
        }
        with open(projects_file, "w") as f:
            _yaml.dump(data, f, default_flow_style=False, allow_unicode=True)
        print(f"  7. Registered in projects.yaml")
        print(f"\n  ✓ Project '{args.name}' ready at {project_path}")

    elif args.command == "skills":
        from brain.router import list_skills
        print("Available skills (task routing):")
        for s in list_skills():
            print(f"  - {s}")

    elif args.command == "queue":
        from brain.queue import add_task, get_tasks_by_status, get_pending_tasks, init_db
        from brain.models import AgentType, TaskPriority, TaskStatus

        init_db()

        if args.queue_action == "add":
            priority_map = {"high": 3, "normal": 2, "low": 1}
            task = add_task(
                description=args.description,
                project=args.project,
                priority=priority_map[args.priority],
                agent_type=args.agent,
            )
            print(f"Task {task.id[:8]} added: {args.description}")

        elif args.queue_action == "list":
            tasks = get_tasks_by_status(args.status) if args.status else get_pending_tasks()
            if not tasks:
                print("No tasks found.")
            else:
                for t in tasks:
                    desc = t.description[:50] + ("..." if len(t.description) > 50 else "")
                    print(f"  {t.id[:8]}  [{t.status.value:12s}]  {t.priority.name:6s}  {desc}")

        elif args.queue_action == "process":
            from brain.daemon import process_queue
            results = process_queue(config=config, max_tasks=args.max)
            if not results:
                print("No pending tasks.")
            else:
                for r in results:
                    print(f"  {r['id'][:8]}  [{r['status']:12s}]  {r['result_preview'][:60]}")

        else:
            from brain.queue import init_db as _init
            _init()
            print("Usage: geofrey queue {add|list|process}")

    elif args.command == "briefing":
        from brain.briefing import show_briefing
        show_briefing()

    elif args.command == "overnight":
        from brain.daemon import run_overnight
        run_overnight(config=config)

    elif args.command == "install-daemon":
        from brain.daemon import get_launchd_plist
        plist = get_launchd_plist()
        print(plist)
        print("\n--- Installation ---")
        print("1. Save the above to ~/Library/LaunchAgents/ai.geofrey.overnight.plist")
        print("2. Load:  launchctl load ~/Library/LaunchAgents/ai.geofrey.overnight.plist")
        print("3. Check: launchctl list | grep geofrey")

    elif args.command == "preflight":
        from brain.preflight import run_preflight, format_preflight
        results = run_preflight(config)
        print(format_preflight(results))
        all_ok = all(ok for ok, _ in results.values())
        sys.exit(0 if all_ok else 1)

    elif args.command == "embed":
        import subprocess
        cmd = [sys.executable, "scripts/embed.py"] + remaining
        subprocess.run(cmd)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
