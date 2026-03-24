---
title: "Automatic knowledge base update pipeline"
category: "self-maintenance"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/changelog"
last_verified: "2026-03-22"
content_hash: ""
---

# Automatic Knowledge Base Update Pipeline

The update pipeline keeps Maestro's knowledge base current by monitoring official sources, detecting changes, and regenerating affected chunks. The markdown files in `knowledge/` are the source of truth — the vector database is always rebuildable from them.

## How It Works

### 1. Cron trigger (daily at 03:00)

A cron job starts the update process:

```cron
0 3 * * * /Users/slavkoklincov/Code/maestro/scripts/update_knowledge.sh >> /Users/slavkoklincov/Code/maestro/logs/cron.log 2>&1
```

### 2. Read source registry

The script reads `config/sources_registry.yaml` which lists all monitored URLs and commands.

### 3. Fetch content for each source

For URL sources:
```bash
curl -s "https://docs.anthropic.com/en/docs/claude-code/cli-reference" | html2text > /tmp/source_content.txt
```

For command sources:
```bash
npm view @anthropic-ai/claude-code version > /tmp/version.txt
```

### 4. Compute content hash

```bash
sha256sum /tmp/source_content.txt | cut -d' ' -f1
```

### 5. Compare with stored hash

Each knowledge chunk's frontmatter contains `content_hash`. If the new hash differs from the stored hash, the source has changed.

### 6. Mark chunks for update

The `maps_to` field in `sources_registry.yaml` links each source to its knowledge chunks. All mapped chunks are flagged for regeneration.

### 7. Regenerate changed chunks

Use the local LLM to produce updated chunk content:

```bash
# Pseudocode
for chunk in changed_chunks:
    prompt = load_template("chunk_generation_prompt.md")
    prompt = prompt.format(
        source_content=new_content,
        existing_chunk=read_file(chunk.path),
        format_rules=load_template("chunk_format_rules.md")
    )
    new_chunk = llm.generate(prompt)
    write_file(chunk.path, new_chunk)
```

### 8. Update frontmatter

Set `content_hash` to the new hash and `last_verified` to today's date.

### 9. Re-embed only changed chunks

```python
import chromadb

client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_collection("maestro_knowledge")

for chunk in changed_chunks:
    collection.upsert(
        ids=[chunk.id],
        documents=[chunk.content],
        metadatas=[chunk.metadata]
    )
```

Only changed chunks are re-embedded, not the entire knowledge base.

### 10. Check for new features

The pipeline also monitors changelog and release sources. If a new feature is detected that has no corresponding chunk:

- Create a new chunk file in the appropriate subdirectory
- Generate content from the changelog/release notes
- Embed the new chunk

### 11. Write log

```
logs/update_2026-03-22.log
---
Run started: 2026-03-22 03:00:01
Sources checked: 8
Sources changed: 2
Chunks updated: 3
Chunks created: 1
New features detected: ["MCP server support"]
Errors: 0
Run completed: 2026-03-22 03:02:15
```

### 12. Optional notifications

If changes were detected, send a summary notification (e.g., to a log file or messaging webhook) so you can review what changed.

## Key Design Decisions

- **Markdown files are the source of truth**, not ChromaDB. The DB can always be rebuilt from the `.md` files.
- **Only changed chunks are re-embedded** to minimize compute and preserve embedding stability.
- **Hash comparison uses the main content only**, filtering out dynamic elements like timestamps or ads from scraped pages.
