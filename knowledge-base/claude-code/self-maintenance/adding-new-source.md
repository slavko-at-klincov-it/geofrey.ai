---
title: "Adding new sources and handling feature changes"
category: "self-maintenance"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/changelog"
last_verified: "2026-03-22"
content_hash: ""
---

# Adding New Sources and Handling Feature Changes

When Claude Code releases a new feature or deprecates an existing one, the knowledge base must be updated to stay accurate.

## When Claude Code Adds a New Feature

### Step 1: Identify the documentation URL

Check the changelog or release notes for the new feature. Find its documentation page:

```
https://docs.anthropic.com/en/docs/claude-code/new-feature-name
```

### Step 2: Add to sources_registry.yaml

```yaml
  - url: "https://docs.anthropic.com/en/docs/claude-code/new-feature-name"
    type: "official_docs"
    maps_to: ["appropriate-category/new-feature-name.md"]
    check_frequency: "daily"
```

Choose the right category directory: `cli/`, `skills/`, `hooks/`, `permissions/`, `settings/`, `models/`, etc.

### Step 3: Create the new chunk file

Create the file in the appropriate `knowledge/` subdirectory:

```bash
touch ~/Code/maestro/knowledge/appropriate-category/new-feature-name.md
```

Write the chunk with proper frontmatter:

```yaml
---
title: "New feature name — what it does"
category: "appropriate-category"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/new-feature-name"
last_verified: "2026-03-22"
content_hash: ""
---
```

Then write self-contained content explaining the feature with at least one practical example.

### Step 4: Include proper frontmatter

The `content_hash` starts empty. The update pipeline will populate it on the next run after fetching and hashing the source.

### Step 5: Run embedding for the new chunk only

```bash
python scripts/embed_chunk.py knowledge/appropriate-category/new-feature-name.md
```

This adds the chunk to ChromaDB without re-embedding everything.

### Step 6: Test retrieval

Query the knowledge base to verify the new chunk is retrievable:

```bash
python scripts/query_knowledge.py "How do I use new-feature-name?"
```

The new chunk should appear in the top results.

## When a Feature Is Deprecated

### Step 1: Update the existing chunk

Add a deprecation notice at the top of the chunk content:

```markdown
> **DEPRECATED since Claude Code v1.x.x**: This feature has been replaced by [new-feature].
> See the [new-feature] documentation for the current approach.
```

### Step 2: Add information about the replacement

Explain what replaces the deprecated feature and how to migrate:

```markdown
## Migration
Previously: `claude --old-flag "task"`
Now: `claude --new-flag "task"`
```

### Step 3: Keep the chunk for 2 versions

Do not delete deprecated chunks immediately. Users may still be on older versions. Keep the chunk for at least 2 Claude Code version releases after deprecation.

### Step 4: Archive after 2 versions

Move the chunk to an archive directory:

```bash
mkdir -p ~/Code/maestro/knowledge/_archive
mv knowledge/cli/old-feature.md knowledge/_archive/old-feature.md
```

Remove it from ChromaDB:

```bash
python scripts/remove_chunk.py "old-feature"
```

## Complete Example: Adding MCP Server Support

```bash
# 1. New feature detected in changelog: MCP Server support

# 2. Add source
cat >> config/sources_registry.yaml << 'EOF'
  - url: "https://docs.anthropic.com/en/docs/claude-code/mcp-servers"
    type: "official_docs"
    maps_to: ["context/mcp-servers.md"]
    check_frequency: "daily"
EOF

# 3. Create chunk
cat > knowledge/context/mcp-servers.md << 'CHUNK'
---
title: "MCP Server integration in Claude Code"
category: "context"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/mcp-servers"
last_verified: "2026-03-22"
content_hash: ""
---

# MCP Server Integration

Claude Code can connect to MCP (Model Context Protocol) servers...
[Full self-contained explanation with examples]
CHUNK

# 4. Embed
python scripts/embed_chunk.py knowledge/context/mcp-servers.md

# 5. Test
python scripts/query_knowledge.py "How to use MCP servers with Claude Code?"
```
