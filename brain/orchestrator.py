"""geofrey brain — orchestrates local LLM, Knowledge Hub, and Claude Code."""

import os
import re
import shlex
import subprocess
import argparse
from pathlib import Path

import yaml
import ollama
import chromadb

from knowledge.store import load_config
from brain.prompts import ORCHESTRATOR_PROMPT, CHAT_PROMPT
from brain.safety import get_safety_context, ALWAYS_INJECT


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


def get_projects_text() -> str:
    """Format project registry as human-readable text for LLM context."""
    projects = load_projects()
    lines = [f"- {name}: {info['path']} ({info['stack']}) — {info['description']}"
             for name, info in projects.items()]
    return "\n".join(lines) if lines else "(No projects configured)"


def retrieve_context(query: str, top_k: int = 3, config: dict | None = None) -> str:
    """Retrieve relevant knowledge chunks via RAG."""
    config = _get_config(config)
    db_path = str(Path(os.path.expanduser(config["paths"]["vectordb"])))

    try:
        client = chromadb.PersistentClient(path=db_path)
        collection = client.get_collection("claude_code")
    except ValueError:
        return "(Knowledge base not initialized. Run: python main.py embed)"

    # Query embedding
    try:
        response = ollama.embed(model=config["embedding"]["model"], input=query)
        query_embedding = response["embeddings"][0]
    except Exception as e:
        return f"(Embedding failed: {e}. Is Ollama running?)"

    # Retrieve relevant chunks
    results = collection.query(
        query_embeddings=[query_embedding], n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    # Always inject safety
    safety_text = get_safety_context(client)

    # Personal context (profile only — keeps it small for 9B)
    personal_text = ""
    try:
        ctx_col = client.get_collection("context_personal")
        profile = ctx_col.get(ids=["ctx_profile"], include=["documents"])
        if profile["documents"]:
            personal_text = profile["documents"][0]
    except ValueError:
        pass

    # Combine
    context_parts = []
    if personal_text:
        context_parts.append("=== PERSONAL CONTEXT ===")
        context_parts.append(personal_text)
    if safety_text:
        context_parts.append("\n" + safety_text)

    context_parts.append("\n=== RELEVANT KNOWLEDGE ===")
    seen_ids = set(ALWAYS_INJECT)
    for i in range(len(results["ids"][0])):
        doc_id = results["ids"][0][i]
        if doc_id not in seen_ids:
            title = results["metadatas"][0][i].get("title", "")
            content = results["documents"][0][i]
            score = 1 - results["distances"][0][i]
            context_parts.append(f"\n--- {title} (relevance: {score:.2f}) ---")
            context_parts.append(content)
            seen_ids.add(doc_id)

    return "\n".join(context_parts)


def chat(user_message: str, history: list[dict], config: dict | None = None) -> str:
    """Send message to local LLM with RAG context."""
    config = _get_config(config)
    llm_model = config["llm"]["model"]
    max_history = config.get("orchestrator", {}).get("max_history", 20)

    context = retrieve_context(user_message, top_k=3, config=config)

    system = ORCHESTRATOR_PROMPT.format(
        projects=get_projects_text(),
        personal_context="(see context below)",
    )

    messages = [{"role": "system", "content": system}]

    # RAG context as separate conversation turn
    if context and not context.startswith("("):
        messages.append({"role": "user", "content": "Reference documentation:\n" + context[:4000]})
        messages.append({"role": "assistant", "content": "Got it. I'll use this to construct the correct claude CLI command. What task do you need?"})

    # History
    if len(history) > max_history * 2:
        messages.extend(history[-(max_history * 2):])
    else:
        messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    try:
        response = ollama.chat(model=llm_model, messages=messages, think=False)
        return response["message"]["content"]
    except Exception as e:
        return f"Error calling LLM: {e}\nIs Ollama running? Is {llm_model} pulled?"


def extract_command(response: str) -> str | None:
    """Extract Claude Code command from LLM response."""
    cmd_match = re.search(r"```(?:bash|sh)?\s*\n(claude .*?)```", response, re.DOTALL)
    if cmd_match:
        return cmd_match.group(1).strip()
    cmd_match = re.search(r"`(claude -[^\`]+)`", response)
    if cmd_match:
        return cmd_match.group(1).strip()
    return None


def execute_command(command: str) -> bool:
    """Ask user to confirm and execute a Claude Code command."""
    print(f"\n  Command to execute:")
    print(f"  {command}")
    confirm = input("\n  Execute? [y/N]: ").strip().lower()
    if confirm == "y":
        print("\n  Running...\n")
        result = subprocess.run(["bash", "-c", command], shell=False)
        return result.returncode == 0
    print("  Skipped.")
    return False


def interactive():
    """Run geofrey in interactive chat mode."""
    print("=" * 50)
    print("  geofrey — Personal AI Assistant")
    print("  Type 'quit' to exit")
    print("=" * 50)

    history = []
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

        print("\n  Thinking...\n")
        response = chat(user_input, history)
        print(f"  geofrey: {response}")

        history.append({"role": "user", "content": user_input})
        history.append({"role": "assistant", "content": response})

        command = extract_command(response)
        if command:
            execute_command(command)


def single_task(task: str):
    """Process a single task."""
    print(f"  Task: {task}\n")
    response = chat(task, [])
    print(f"  geofrey: {response}")
    command = extract_command(response)
    if command:
        execute_command(command)
