---
title: "Template-Based Prompt Management"
category: "prompt-templates"
source_urls:
  - "https://github.com/garrytan/gstack"
last_verified: "2026-03-25"
content_hash: ""
---

# Template-Based Prompt Management

## Why Templates Beat Hardcoded Strings

Embedding system prompts as Python string constants creates several problems:
- Prompts are buried in code, hard to review and iterate on
- JSON examples need double-brace escaping (`{{` → `{`)
- Non-developers can't edit prompts without touching Python
- Version control diffs mix code logic with prompt content

## gstack's Template Pattern

gstack uses `.md.tmpl` files with `{{PLACEHOLDER}}` substitution:
- Templates are auto-generated from TypeScript resolvers
- Resolvers inject dynamic content (command lists, session state, config)
- If a command exists in code, it appears in docs; if removed, it vanishes
- Three resolver tiers: Preamble, Browse, Testing

## Practical Implementation

For a Python orchestrator:

### Template Format
Markdown files in `brain/templates/` with `{{variable}}` placeholders:
```markdown
You are geofrey. Generate Claude Code CLI commands for {{task_type}} tasks.

KNOWN PROJECTS:
{{projects}}
```

### Template Loader
```python
def render_template(name: str, **kwargs: str) -> str:
    template = load_template(name)
    for key, value in kwargs.items():
        template = template.replace(f"{{{{{key}}}}}", str(value))
    return template
```

### Benefits of `str.replace()` over `.format()`
- No escaping needed for `{` in JSON examples
- Unknown placeholders are left as-is (safe partial rendering)
- Simpler debugging — template content is visible as-is in markdown

### Shared Fragments
Extract common rules into a `base-rules.md` template that skill templates include via `{{base_rules}}`. This prevents rule duplication across skills.
