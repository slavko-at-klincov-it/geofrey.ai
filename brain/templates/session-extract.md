Extract concrete learnings from this Claude Code session segment.
Skip routine operations, status updates, and small talk. Focus on actionable knowledge.

PROJECT: {{project_name}}
DATE: {{session_date}}

TRANSCRIPT:
{{chunk_text}}

Extract into these categories (skip empty ones). Be specific — include file names, error messages, versions.

Respond in JSON. For decisions, use structured objects with title, rationale, category, scope (file paths), keywords, and change_warning (note to future AI: what NOT to do). Other categories remain string arrays.

{"decisions": [{"title": "...", "rationale": "...", "category": "architecture|implementation|tooling|convention|security|design", "scope": ["file/path"], "keywords": ["..."], "change_warning": "Do not..."}], "bugs": ["..."], "discoveries": ["..."], "negative_knowledge": ["..."], "configuration": ["..."], "patterns": ["..."]}
