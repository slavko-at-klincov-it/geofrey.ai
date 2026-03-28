"""Sandbox setup — creates 3 fictional projects with git repos, decisions, and config."""

import subprocess
from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass
class SandboxContext:
    """All paths and config needed by use cases."""
    root: Path
    config: dict
    projects: dict
    webshop_path: str
    api_gateway_path: str
    data_pipeline_path: str
    decisions_path: str


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _git_init(project_path: Path) -> None:
    """Initialize a git repo with an initial commit."""
    subprocess.run(["git", "init"], cwd=project_path, capture_output=True)
    subprocess.run(["git", "add", "."], cwd=project_path, capture_output=True)
    subprocess.run(
        ["git", "-c", "user.name=test", "-c", "user.email=test@test.com",
         "commit", "-m", "Initial commit"],
        cwd=project_path, capture_output=True,
    )


def _setup_webshop(root: Path) -> None:
    """Create fictional webshop project."""
    p = root / "webshop"
    _write(p / "src" / "app.py", '''"""Webshop application — Flask backend."""
from flask import Flask
app = Flask(__name__)

@app.route("/")
def index():
    return "Webshop running"
''')
    _write(p / "src" / "auth.py", '''"""JWT authentication module."""
import jwt

def create_token(user_id: str, secret: str) -> str:
    return jwt.encode({"sub": user_id}, secret, algorithm="HS256")

def verify_token(token: str, secret: str) -> dict:
    return jwt.decode(token, secret, algorithms=["HS256"])
''')
    _write(p / "src" / "cart.py", '''"""Shopping cart logic."""

class Cart:
    def __init__(self):
        self.items = []

    def add_item(self, product_id: str, qty: int = 1):
        self.items.append({"product_id": product_id, "qty": qty})

    def total(self) -> int:
        return len(self.items)
''')
    _write(p / "tests" / "test_auth.py", '''"""Auth tests."""
def test_create_token():
    assert True  # placeholder
''')
    _write(p / "CLAUDE.md", """# Webshop

E-commerce application. Python + PostgreSQL backend, React frontend.

## Conventions
- Use pytest for testing
- Follow PEP 8
- JWT tokens for auth
- PostgreSQL for persistence
""")
    _write(p / "docs" / "architecture.md", """# Webshop Architecture

## Overview
MVC with Flask backend, PostgreSQL, React frontend.

## Modules
- src/app.py: main application entry point
- src/auth.py: JWT authentication (create + verify tokens)
- src/cart.py: shopping cart logic
""")
    _write(p / "requirements.txt", "flask\npyjwt\npsycopg2\n")
    _git_init(p)
    # Create dirty state for git status
    (p / "src" / "auth.py").write_text(
        (p / "src" / "auth.py").read_text() + "\n# Modified for testing\n"
    )


def _setup_api_gateway(root: Path) -> None:
    """Create fictional api-gateway project."""
    p = root / "api-gateway"
    _write(p / "src" / "gateway.py", '''"""API Gateway — FastAPI based."""
from fastapi import FastAPI
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}
''')
    _write(p / "src" / "middleware.py", '''"""Rate limiting middleware."""
from collections import defaultdict
import time

_requests: dict[str, list[float]] = defaultdict(list)

def rate_limit(client_ip: str, max_per_minute: int = 60) -> bool:
    now = time.time()
    _requests[client_ip] = [t for t in _requests[client_ip] if now - t < 60]
    if len(_requests[client_ip]) >= max_per_minute:
        return False
    _requests[client_ip].append(now)
    return True
''')
    _write(p / "config" / "routes.yaml", """routes:
  - path: /api/v1/users
    service: user-service
  - path: /api/v1/orders
    service: order-service
""")
    _write(p / "CLAUDE.md", """# API Gateway

FastAPI-based API gateway with rate limiting and route configuration.

## Conventions
- OpenAPI spec is source of truth
- Rate limiting via middleware
- YAML-based route config
""")
    _write(p / "docs" / "architecture.md", """# API Gateway Architecture

## Overview
FastAPI gateway proxying requests to microservices.

## Modules
- src/gateway.py: main FastAPI app
- src/middleware.py: rate limiting
- config/routes.yaml: route definitions
""")
    _write(p / "requirements.txt", "fastapi\nuvicorn\n")
    _git_init(p)


def _setup_data_pipeline(root: Path) -> None:
    """Create fictional data-pipeline project."""
    p = root / "data-pipeline"
    _write(p / "src" / "pipeline.py", '''"""ETL pipeline — orchestrates data transforms."""
import sqlite3

def run_pipeline(db_path: str, transforms: list) -> int:
    conn = sqlite3.connect(db_path)
    processed = 0
    for transform in transforms:
        processed += transform(conn)
    conn.close()
    return processed
''')
    _write(p / "src" / "transforms.py", '''"""Data transforms — all idempotent."""

def normalize_emails(conn) -> int:
    cursor = conn.execute("SELECT COUNT(*) FROM users WHERE email LIKE '%@%'")
    return cursor.fetchone()[0]

def deduplicate_records(conn) -> int:
    return 0  # idempotent: no-op if already deduped
''')
    _write(p / "scripts" / "run_etl.sh", "#!/bin/bash\npython -m src.pipeline\n")
    _write(p / "CLAUDE.md", """# Data Pipeline

ETL pipeline for data processing. Python + SQLite for state tracking.

## Conventions
- All transforms must be idempotent
- SQLite for pipeline state (not application data)
- Bash scripts for orchestration
""")
    _write(p / "docs" / "architecture.md", """# Data Pipeline Architecture

## Overview
Batch ETL pipeline with idempotent transforms.

## Modules
- src/pipeline.py: orchestrator
- src/transforms.py: individual transform functions
- scripts/run_etl.sh: entry point
""")
    _write(p / "requirements.txt", "")
    _git_init(p)


def _setup_decisions(root: Path) -> None:
    """Create decision files for all sandbox projects."""
    d = root / "decisions"

    # Webshop decisions
    _write(d / "webshop" / "DEC-WS-001.md", """---
id: DEC-WS-001
title: "Use PostgreSQL for persistence"
status: active
project: webshop
category: tooling
scope: ["src/app.py", "src/cart.py"]
keywords: ["database", "postgresql", "persistence", "db"]
depends_on: []
enables: ["DEC-WS-002"]
---

## Rationale
PostgreSQL chosen for ACID compliance, JSON support, and scalability.

## Change Warning
Do not switch to SQLite or MongoDB for the main application database.
""")
    _write(d / "webshop" / "DEC-WS-002.md", """---
id: DEC-WS-002
title: "JWT auth with refresh tokens"
status: active
project: webshop
category: security
scope: ["src/auth.py"]
keywords: ["jwt", "auth", "token", "refresh", "authentication"]
depends_on: ["DEC-WS-001"]
enables: []
---

## Rationale
Stateless auth via JWT. Refresh tokens for long-lived sessions without storing server-side state.

## Change Warning
Do not switch to session-based auth. JWT is required for the stateless API architecture.
""")
    _write(d / "webshop" / "DEC-WS-003.md", """---
id: DEC-WS-003
title: "React frontend with Tailwind"
status: active
project: webshop
category: design
scope: ["frontend/"]
keywords: ["react", "tailwind", "frontend", "css"]
depends_on: []
enables: []
---

## Rationale
React for component model, Tailwind for utility-first CSS without custom stylesheets.

## Change Warning
Do not introduce a second CSS framework alongside Tailwind.
""")
    _write(d / "webshop" / "DEC-WS-004.md", """---
id: DEC-WS-004
title: "DSGVO-compliant user data handling"
status: superseded
project: webshop
category: security
scope: ["src/app.py"]
keywords: ["dsgvo", "privacy", "user data", "gdpr"]
depends_on: []
enables: []
---

## Rationale
Original DSGVO compliance approach — superseded by new implementation.

## Change Warning
This decision is superseded. See current compliance docs.
""")
    # Circular dependency test
    _write(d / "webshop" / "DEC-WS-CIRC-A.md", """---
id: DEC-WS-CIRC-A
title: "Circular test A"
status: active
project: webshop
category: architecture
scope: []
keywords: ["circular-test"]
depends_on: ["DEC-WS-CIRC-B"]
enables: []
---

## Rationale
Test decision for circular dependency detection.
""")
    _write(d / "webshop" / "DEC-WS-CIRC-B.md", """---
id: DEC-WS-CIRC-B
title: "Circular test B"
status: active
project: webshop
category: architecture
scope: []
keywords: ["circular-test"]
depends_on: ["DEC-WS-CIRC-A"]
enables: []
---

## Rationale
Test decision for circular dependency detection.
""")

    # API Gateway decisions
    _write(d / "api-gateway" / "DEC-AG-001.md", """---
id: DEC-AG-001
title: "Rate limiting via middleware"
status: active
project: api-gateway
category: architecture
scope: ["src/middleware.py"]
keywords: ["rate", "limit", "middleware", "throttle"]
depends_on: []
enables: ["DEC-AG-002"]
---

## Rationale
Centralized rate limiting in middleware layer, not per-route.

## Change Warning
Do not implement per-route rate limiting. Use the middleware layer.
""")
    _write(d / "api-gateway" / "DEC-AG-002.md", """---
id: DEC-AG-002
title: "OpenAPI spec as source of truth"
status: active
project: api-gateway
category: convention
scope: ["config/"]
keywords: ["openapi", "spec", "api", "swagger"]
depends_on: ["DEC-AG-001"]
enables: []
---

## Rationale
OpenAPI YAML defines the contract. Code is generated/validated against it.

## Change Warning
Do not define routes in code without updating the OpenAPI spec first.
""")

    # Data Pipeline decisions
    _write(d / "data-pipeline" / "DEC-DP-001.md", """---
id: DEC-DP-001
title: "Idempotent ETL transforms"
status: active
project: data-pipeline
category: architecture
scope: ["src/transforms.py", "src/pipeline.py"]
keywords: ["etl", "idempotent", "transform", "pipeline"]
depends_on: []
enables: ["DEC-DP-002"]
---

## Rationale
Every transform must be safe to re-run. No side effects on duplicate execution.

## Change Warning
Do not add transforms that are not idempotent. Every transform must handle re-runs.
""")
    _write(d / "data-pipeline" / "DEC-DP-002.md", """---
id: DEC-DP-002
title: "SQLite for pipeline state tracking"
status: active
project: data-pipeline
category: tooling
scope: ["src/pipeline.py"]
keywords: ["sqlite", "state", "pipeline", "tracking"]
depends_on: ["DEC-DP-001"]
enables: []
---

## Rationale
SQLite tracks pipeline state (last run, processed count). Not for application data.

## Change Warning
Do not use SQLite for application data. It is only for pipeline orchestration state.
""")


def _setup_config(root: Path) -> dict:
    """Create sandbox config.yaml and projects.yaml. Returns config dict."""
    projects = {
        "projects": {
            "webshop": {
                "path": str(root / "webshop"),
                "stack": "Python, PostgreSQL, React",
                "description": "E-commerce application",
            },
            "api-gateway": {
                "path": str(root / "api-gateway"),
                "stack": "Python, FastAPI",
                "description": "API Gateway with rate limiting",
            },
            "data-pipeline": {
                "path": str(root / "data-pipeline"),
                "stack": "Python, SQLite",
                "description": "ETL data processing pipeline",
            },
        }
    }
    _write(root / "projects.yaml", yaml.dump(projects, default_flow_style=False))

    config = {
        "llm": {"model": "test-model", "base_url": "http://localhost:11434", "temperature": 0.3},
        "embedding": {"model": "test-embed"},
        "chunking": {"chunk_size": 512, "chunk_overlap": 50},
        "retrieval": {"top_k": 5},
        "paths": {
            "vectordb": str(root / "vectordb"),
            "decisions": str(root / "decisions"),
            "context": "knowledge-base/context",
            "claude_code_kb": "knowledge-base/claude-code",
            "session_learnings": str(root / "session_learnings"),
            "claude_projects": str(root / "claude_projects"),
        },
        "model_policy": {"code": "opus", "analysis": "opus", "content": "sonnet"},
        "skill_defaults": {
            "code-fix": {"model_category": "code", "max_budget_usd": 5.0, "max_turns": 30, "permission_mode": "default", "needs_plan": False},
            "feature": {"model_category": "code", "max_budget_usd": 10.0, "max_turns": 50, "permission_mode": "default", "needs_plan": True},
            "refactor": {"model_category": "code", "max_budget_usd": 10.0, "max_turns": 50, "permission_mode": "default", "needs_plan": True},
            "review": {"model_category": "analysis", "max_budget_usd": 2.0, "max_turns": 15, "permission_mode": "plan", "needs_plan": False},
            "research": {"model_category": "analysis", "max_budget_usd": 5.0, "max_turns": 20, "permission_mode": "plan", "needs_plan": False},
            "security": {"model_category": "analysis", "max_budget_usd": 5.0, "max_turns": 20, "permission_mode": "plan", "needs_plan": False},
            "doc-sync": {"model_category": "content", "max_budget_usd": 3.0, "max_turns": 30, "permission_mode": "default", "needs_plan": False},
        },
    }
    _write(root / "config.yaml", yaml.dump(config, default_flow_style=False))

    return config, projects["projects"]


def create_sandbox(root: Path) -> SandboxContext:
    """Create the full sandbox with 3 projects, git repos, decisions, and config."""
    if root.exists():
        import shutil
        shutil.rmtree(root)
    root.mkdir(parents=True)

    _setup_webshop(root)
    _setup_api_gateway(root)
    _setup_data_pipeline(root)
    _setup_decisions(root)
    config, projects = _setup_config(root)

    return SandboxContext(
        root=root,
        config=config,
        projects=projects,
        webshop_path=str(root / "webshop"),
        api_gateway_path=str(root / "api-gateway"),
        data_pipeline_path=str(root / "data-pipeline"),
        decisions_path=str(root / "decisions"),
    )
