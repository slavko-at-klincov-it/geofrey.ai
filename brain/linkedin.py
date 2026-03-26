"""LinkedIn post generation pipeline.

Flow:
1. User gives topic
2. geofrey retrieves: style guide + 3 similar posts + DACH context
3. Qwen3.5-9B generates post draft
4. Claude Code (Sonnet) generates 4 image prompt suggestions
5. User confirms → post saved to knowledge base + all_posts.md
"""

import json
import os
import subprocess
import re
from datetime import date
from pathlib import Path

import ollama
import chromadb

from knowledge.store import load_config
from knowledge.linkedin import get_style_guide, COLLECTION_NAME
from brain.prompts import render_template

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt, Confirm

console = Console()


def _get_similar_posts(topic: str, config: dict, top_k: int = 3) -> str:
    """Retrieve most similar existing posts for few-shot examples."""
    db_path = str(Path(os.path.expanduser(config["paths"]["vectordb"])))
    client = chromadb.PersistentClient(path=db_path)

    try:
        collection = client.get_collection(COLLECTION_NAME)
    except Exception:
        return ""

    if collection.count() == 0:
        return ""

    response = ollama.embed(model=config["embedding"]["model"], input=topic)
    query_embedding = response["embeddings"][0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas"],
    )

    if not results["documents"] or not results["documents"][0]:
        return ""

    parts = []
    for i, (doc, meta) in enumerate(zip(results["documents"][0], results["metadatas"][0]), 1):
        thema = meta.get("thema", "")
        header = f"Beispiel {i}" + (f" (Thema: {thema})" if thema else "")
        parts.append(f"--- {header} ---\n{doc}")

    return "\n\n".join(parts)


def _get_personal_context(config: dict) -> str:
    """Get condensed personal context for LinkedIn prompts."""
    db_path = str(Path(os.path.expanduser(config["paths"]["vectordb"])))
    client = chromadb.PersistentClient(path=db_path)

    try:
        collection = client.get_collection("context_personal")
        # For LinkedIn, profile + DACH market are most relevant
        result = collection.get(
            ids=["ctx_profile", "ctx_dach_market"],
            include=["documents"],
        )
        if result["documents"]:
            return "\n\n".join(result["documents"])
    except Exception:
        pass
    return ""


def generate_post(topic: str, config: dict | None = None) -> str:
    """Generate a LinkedIn post draft for a given topic."""
    config = config or load_config()

    style_guide = get_style_guide(config)
    similar_posts = _get_similar_posts(topic, config)
    personal_context = _get_personal_context(config)

    prompt = render_template(
        "linkedin",
        style_guide=style_guide,
        example_posts=similar_posts or "(Keine ähnlichen Posts gefunden)",
        personal_context=personal_context or "(Kein persönlicher Kontext verfügbar)",
        topic=topic,
    )

    messages = [
        {"role": "system", "content": "Du bist geofrey. Generiere LinkedIn Posts im exakten Stil von Slavko."},
        {"role": "user", "content": prompt},
    ]

    response = ollama.chat(
        model=config["llm"]["model"],
        messages=messages,
        think=False,
        options={"temperature": config.get("linkedin", {}).get("temperature", 0.7), "num_predict": 800},
    )

    return response["message"]["content"]


def generate_image_prompts(post_text: str) -> list[str]:
    """Call Claude Code (Sonnet) to generate 4 image prompt suggestions."""
    prompt = render_template("image", post_text=post_text)

    # Use claude CLI in headless mode
    try:
        result = subprocess.run(
            [
                "claude", "-p", prompt,
                "--model", "sonnet",
                "--max-turns", "1",
                "--max-budget-usd", "0.10",
            ],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0 and result.stdout.strip():
            return _parse_image_options(result.stdout.strip())
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        console.print(f"[yellow]Claude Code nicht verfügbar: {e}[/yellow]")

    return []


def _parse_image_options(text: str) -> list[str]:
    """Parse 4 image prompt options from Claude Code response."""
    # Try numbered list (1. ... 2. ... etc.)
    options = re.findall(r"(?:^|\n)\s*\d+[\.\)]\s*(.+?)(?=\n\s*\d+[\.\)]|\Z)", text, re.DOTALL)
    if len(options) >= 4:
        return [o.strip() for o in options[:4]]

    # Try bullet points
    options = re.findall(r"(?:^|\n)\s*[-*]\s*(.+?)(?=\n\s*[-*]|\Z)", text, re.DOTALL)
    if len(options) >= 4:
        return [o.strip() for o in options[:4]]

    # Fallback: split by double newline
    options = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 20]
    if len(options) >= 4:
        return options[:4]

    # Last resort: return the whole text as one option
    return [text.strip()] if text.strip() else []


def save_post(post_text: str, topic: str, config: dict):
    """Save confirmed post to linkedin_style collection and all_posts.md."""
    db_path = str(Path(os.path.expanduser(config["paths"]["vectordb"])))
    client = chromadb.PersistentClient(path=db_path)
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"},
    )

    # Determine next post number
    existing = collection.get(include=["metadatas"])
    max_num = 0
    if existing["metadatas"]:
        for meta in existing["metadatas"]:
            num = meta.get("post_number", 0)
            if isinstance(num, int) and num > max_num:
                max_num = num
    next_num = max_num + 1
    today = date.today().isoformat()

    # Embed and store
    response = ollama.embed(model=config["embedding"]["model"], input=post_text)
    embedding = response["embeddings"][0]
    collection.upsert(
        ids=[f"linkedin_post_{next_num}"],
        documents=[post_text],
        embeddings=[embedding],
        metadatas=[{
            "post_number": next_num, "post_date": today,
            "thema": topic, "word_count": len(post_text.split()),
            "quellen": "",
        }],
    )

    # Append to all_posts.md
    posts_path = config.get("paths", {}).get("linkedin_posts", "data/linkedin/all_posts.md")
    posts_path = str(Path(os.path.expanduser(posts_path)).resolve()
                      if Path(os.path.expanduser(posts_path)).is_absolute()
                      else (Path(__file__).parent.parent / posts_path).resolve())

    entry = f"\n\n## Post {next_num} - {today}\nThema: {topic}\nText:\n{post_text}\nQuellen: []\n"
    with open(posts_path, "a", encoding="utf-8") as f:
        f.write(entry)

    console.print(f"[green]Post #{next_num} gespeichert.[/green]")
    return next_num


def linkedin_flow(topic: str | None = None):
    """Full interactive LinkedIn post generation flow."""
    config = load_config()

    # Step 1: Get topic
    if not topic:
        topic = Prompt.ask("[bold blue]Thema für den Post[/bold blue]")
    if not topic:
        return

    # Step 2: Generate post
    console.print(f"\n[dim]Generiere Post über: {topic}...[/dim]\n")
    post_text = generate_post(topic, config)

    console.print(Panel(post_text, title="LinkedIn Post Entwurf", border_style="blue"))
    word_count = len(post_text.split())
    console.print(f"[dim]{word_count} Wörter[/dim]\n")

    # Step 3: Edit loop
    while True:
        action = Prompt.ask(
            "Was möchtest du?",
            choices=["nehmen", "neu", "bearbeiten", "bild", "abbrechen"],
            default="nehmen",
        )

        if action == "abbrechen":
            console.print("[dim]Abgebrochen.[/dim]")
            return

        elif action == "neu":
            console.print(f"\n[dim]Generiere neuen Entwurf...[/dim]\n")
            post_text = generate_post(topic, config)
            console.print(Panel(post_text, title="Neuer Entwurf", border_style="blue"))
            console.print(f"[dim]{len(post_text.split())} Wörter[/dim]\n")

        elif action == "bearbeiten":
            console.print("[dim]Kopiere den Text, bearbeite ihn, und füge ihn hier ein.[/dim]")
            console.print("[dim]Leere Zeile + Enter zum Beenden.[/dim]")
            lines = []
            while True:
                try:
                    line = input()
                    if line == "" and lines:
                        break
                    lines.append(line)
                except EOFError:
                    break
            if lines:
                post_text = "\n".join(lines)
                console.print(Panel(post_text, title="Bearbeiteter Post", border_style="green"))

        elif action == "bild":
            console.print("\n[dim]Frage Claude Code (Sonnet) nach Bild-Vorschlägen...[/dim]\n")
            options = generate_image_prompts(post_text)
            if options:
                for i, opt in enumerate(options, 1):
                    console.print(Panel(opt, title=f"Option {i}", border_style="magenta"))
            else:
                console.print("[yellow]Keine Bild-Vorschläge erhalten.[/yellow]")

        elif action == "nehmen":
            save_post(post_text, topic, config)
            console.print("\n[bold green]Post gespeichert und zur Knowledge Base hinzugefügt![/bold green]")
            console.print("[dim]Du kannst ihn jetzt auf LinkedIn posten.[/dim]")

            # Offer image prompts
            if Confirm.ask("\nBild-Prompts generieren?", default=True):
                console.print("\n[dim]Frage Claude Code (Sonnet)...[/dim]\n")
                options = generate_image_prompts(post_text)
                if options:
                    for i, opt in enumerate(options, 1):
                        console.print(Panel(opt, title=f"Bild-Option {i}", border_style="magenta"))
                else:
                    console.print("[yellow]Keine Bild-Vorschläge erhalten.[/yellow]")
            return
