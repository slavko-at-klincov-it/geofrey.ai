---
title: "Troubleshooting the knowledge base update pipeline"
category: "self-maintenance"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code"
last_verified: "2026-03-22"
content_hash: ""
---

# Troubleshooting the Update Pipeline

Common issues with the automatic knowledge base update process and how to fix them.

## Scraping Fails

**Symptom**: The pipeline logs show HTTP errors or empty content for a source URL.

**Causes**:
- The website restructured and the URL is now a 404
- Rate limiting or bot detection blocked the request
- The page now requires JavaScript rendering

**Fix**:
1. Manually visit the URL in a browser to verify it still exists
2. If the URL changed, update it in `config/sources_registry.yaml`
3. If the page requires JS rendering, switch from `curl` to a headless browser scraper
4. Add retry logic with exponential backoff for transient failures

## Hash Always Different

**Symptom**: Every pipeline run marks the source as changed, even when the actual documentation has not changed.

**Causes**:
- Dynamic content on the page: timestamps, session IDs, ads, analytics scripts
- Different content served based on cookies or headers

**Fix**:
1. Filter the scraped content to extract only the main article body before hashing
2. Strip HTML tags, whitespace, and known dynamic elements
3. Use a content extraction library that targets the `<article>` or `<main>` tag

```python
# Example: extract main content only
from bs4 import BeautifulSoup
soup = BeautifulSoup(html, 'html.parser')
main = soup.find('article') or soup.find('main')
clean_text = main.get_text(strip=True)
content_hash = hashlib.sha256(clean_text.encode()).hexdigest()
```

## LLM Generates Bad Chunk

**Symptom**: The regenerated chunk is too long, too short, missing examples, or off-topic.

**Fix**:
1. Review the prompt template used for chunk generation (`templates/chunk_generation_prompt.md`)
2. Add explicit constraints: "200-500 tokens", "include at least one code example", "follow the exact frontmatter format"
3. Include a good example chunk in the prompt as a few-shot example
4. If the source content is too large, pre-extract the relevant section before passing to the LLM

## Embedding Quality Poor

**Symptom**: Queries return irrelevant chunks, or the correct chunk is not in the top results.

**Diagnosis**:
```bash
python scripts/query_knowledge.py "your test query" --top-k 10 --show-scores
```

**Fix**:
1. If a chunk covers too many topics, split it into focused sub-chunks
2. If a chunk is too narrow (under 100 tokens), merge it with a related chunk
3. Ensure the `title` field contains the keywords users would search for
4. Re-embed all chunks if the embedding model was changed:
   ```bash
   python scripts/rebuild_embeddings.py
   ```

## ChromaDB Corruption

**Symptom**: Queries throw errors, or the collection is missing entries.

**Fix**:
1. Delete the collection entirely
2. Re-embed all chunks from the markdown files

```bash
# The .md files are always the source of truth
rm -rf ./chroma_db
python scripts/rebuild_embeddings.py
```

This rebuilds the entire vector database from the knowledge/ directory. No data is lost because the markdown files are the canonical source.

## New Feature Missed

**Symptom**: Claude Code shipped a new feature, but no chunk was created for it.

**Causes**:
- The changelog or release notes were not parsed correctly
- The feature was announced in a blog post not in the monitored sources
- The pipeline's feature detection logic did not recognize the new entry

**Fix**:
1. Add more sources to monitor: blog RSS feeds, GitHub discussions
2. Increase check frequency for changelog/release sources to `hourly` during active release periods
3. Improve the feature detection prompt: provide examples of how new features appear in changelogs
4. Manually create the chunk and add the source to the registry when automatic detection fails
