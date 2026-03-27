"""geofrey web UI — FastAPI application with REST + WebSocket endpoints.

Wraps existing brain/ and knowledge/ modules. No logic duplication.
All heavy operations run via asyncio.to_thread() to keep the event loop responsive.
"""

import asyncio
import json
from dataclasses import asdict
from datetime import datetime
from enum import Enum
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# --- Pydantic request models ---

class TaskCreate(BaseModel):
    """Request body for creating a task."""
    description: str
    project: str | None = None
    priority: str = "normal"
    agent: str = "coder"


class SearchRequest(BaseModel):
    """Request body for knowledge search."""
    query: str
    collections: list[str] = ["knowledge"]
    top_k: int = 5


class PostGenerate(BaseModel):
    """Request body for LinkedIn post generation."""
    topic: str


class PostSave(BaseModel):
    """Request body for saving a LinkedIn post."""
    text: str
    topic: str


# --- Helpers ---

STATIC_DIR = Path(__file__).parent / "static"
BRIEFING_JSON = Path.home() / ".knowledge" / "briefing.json"


def _task_to_dict(task) -> dict:
    """Convert a Task dataclass to JSON-serializable dict."""
    d = asdict(task)
    for key, val in d.items():
        if isinstance(val, Enum):
            d[key] = val.value
        elif isinstance(val, datetime):
            d[key] = val.isoformat()
    return d


# --- App factory ---

def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(title="geofrey", docs_url="/docs")

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    # Load config once at startup
    from knowledge.store import load_config
    config = load_config()

    # --- Routes ---

    @app.get("/")
    async def index():
        """Serve the SPA."""
        return FileResponse(str(STATIC_DIR / "index.html"))

    @app.get("/api/status")
    async def status():
        """Knowledge collections and chunk counts."""
        from knowledge.store import VectorStore
        def _status():
            store = VectorStore(config)
            return store.status()
        return await asyncio.to_thread(_status)

    @app.get("/api/briefing")
    async def briefing():
        """Latest morning briefing."""
        if BRIEFING_JSON.exists():
            data = json.loads(BRIEFING_JSON.read_text(encoding="utf-8"))
            return data
        return {"generated_at": None, "done": [], "needs_approval": [], "needs_input": [], "project_status": []}

    @app.get("/api/tasks")
    async def list_tasks(status: str | None = None):
        """List tasks, optionally filtered by status."""
        from brain.queue import get_tasks_by_status, get_pending_tasks, init_db
        def _tasks():
            init_db()
            if status:
                return get_tasks_by_status(status)
            # Return all tasks by querying each status
            all_tasks = []
            for s in ["pending", "running", "done", "failed", "needs_input"]:
                all_tasks.extend(get_tasks_by_status(s))
            return all_tasks
        tasks = await asyncio.to_thread(_tasks)
        return [_task_to_dict(t) for t in tasks]

    @app.post("/api/tasks")
    async def create_task(req: TaskCreate):
        """Add a task to the queue."""
        from brain.queue import add_task, init_db
        priority_map = {"high": 3, "normal": 2, "low": 1}
        def _add():
            init_db()
            return add_task(
                description=req.description,
                project=req.project or None,
                priority=priority_map.get(req.priority, 2),
                agent_type=req.agent,
            )
        task = await asyncio.to_thread(_add)
        return _task_to_dict(task)

    @app.get("/api/projects")
    async def projects():
        """List known projects from registry."""
        from brain.orchestrator import load_projects
        return await asyncio.to_thread(load_projects)

    @app.get("/api/skills")
    async def skills():
        """List available routing skills."""
        from brain.router import list_skills
        return await asyncio.to_thread(list_skills)

    @app.post("/api/search")
    async def search(req: SearchRequest):
        """Search knowledge base via RAG."""
        from knowledge.hub import KnowledgeHub
        def _search():
            hub = KnowledgeHub()
            results = hub.query(req.query, collections=req.collections, top_k=req.top_k)
            for r in results:
                r["score"] = round(1 - r["distance"], 3)
            return results
        return await asyncio.to_thread(_search)

    @app.post("/api/post/generate")
    async def post_generate(req: PostGenerate):
        """Generate a LinkedIn post draft."""
        from brain.linkedin import generate_post
        text = await asyncio.to_thread(generate_post, req.topic, config)
        return {"text": text, "word_count": len(text.split())}

    @app.post("/api/post/save")
    async def post_save(req: PostSave):
        """Save a confirmed LinkedIn post."""
        from brain.linkedin import save_post
        num = await asyncio.to_thread(save_post, req.text, req.topic, config)
        return {"post_number": num}

    # --- WebSocket Chat ---

    @app.websocket("/ws/chat")
    async def chat_ws(ws: WebSocket):
        """Chat with geofrey via WebSocket.

        Protocol:
        - Client sends: {"message": "..."}
        - Server sends: {"type": "status|chunk|preview|done|error", ...}
        """
        await ws.accept()
        history: list[dict] = []

        try:
            while True:
                data = await ws.receive_json()
                message = data.get("message", "").strip()
                if not message:
                    continue

                # 1. Detect task type
                from brain.router import detect_task_type
                task_type = detect_task_type(message)
                await ws.send_json({"type": "status", "text": f"Task-Typ: {task_type}"})

                # 2. Detect project
                from brain.orchestrator import detect_project
                project_name, project_path = detect_project(message)
                if project_name:
                    await ws.send_json({"type": "status", "text": f"Projekt: {project_name}"})

                    # 3. If project detected, show enrichment preview + offer to queue
                    from brain.enricher import enrich_prompt
                    def _enrich():
                        return enrich_prompt(message, project_name, project_path, task_type, config)
                    try:
                        enriched = await asyncio.to_thread(_enrich)
                        preview = enriched.enriched_prompt[:800]
                        total = len(enriched.enriched_prompt)
                        await ws.send_json({
                            "type": "preview",
                            "task_type": task_type,
                            "project": project_name,
                            "prompt_preview": preview,
                            "total_chars": total,
                        })
                    except Exception as e:
                        await ws.send_json({"type": "error", "text": f"Enrichment fehlgeschlagen: {e}"})

                    await ws.send_json({"type": "done"})
                    continue

                # 4. General chat — stream from Ollama with personal context
                try:
                    from knowledge.hub import KnowledgeHub
                    def _context():
                        hub = KnowledgeHub()
                        profile = hub.get_profile_context()
                        rag = hub.query(message, collections=["knowledge", "claude_code"], top_k=3)
                        rag_text = "\n\n".join(r["text"][:300] for r in rag) if rag else ""
                        return profile, rag_text
                    profile_ctx, rag_ctx = await asyncio.to_thread(_context)
                except Exception:
                    profile_ctx, rag_ctx = "", ""

                system_parts = ["Du bist geofrey, Slavkos autonomer Personal Agent. Antworte hilfreich, präzise und im Kontext des DACH-Markts."]
                if profile_ctx:
                    system_parts.append(f"\n=== PROFIL ===\n{profile_ctx}")
                if rag_ctx:
                    system_parts.append(f"\n=== KONTEXT ===\n{rag_ctx}")

                history.append({"role": "user", "content": message})
                # Keep history manageable
                if len(history) > 20:
                    history = history[-20:]

                messages = [{"role": "system", "content": "\n".join(system_parts)}] + history

                # Stream from Ollama
                import ollama
                def _stream():
                    return ollama.chat(
                        model=config["llm"]["model"],
                        messages=messages,
                        stream=True,
                        think=False,
                        options={"temperature": config.get("orchestrator", {}).get("temperature", 0.3)},
                    )

                try:
                    stream = await asyncio.to_thread(_stream)
                    full_response = []
                    for chunk in stream:
                        token = chunk.get("message", {}).get("content", "")
                        if token:
                            full_response.append(token)
                            await ws.send_json({"type": "chunk", "text": token})
                    assistant_msg = "".join(full_response)
                    history.append({"role": "assistant", "content": assistant_msg})
                except Exception as e:
                    await ws.send_json({"type": "error", "text": f"Ollama-Fehler: {e}. Ist Ollama gestartet?"})

                await ws.send_json({"type": "done"})

        except WebSocketDisconnect:
            pass

    return app
