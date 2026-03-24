---
title: "Recovery strategies for Claude Code failures"
category: "error-handling"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/troubleshooting"
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Recovery Strategies

## Session Crashed or Interrupted

If Claude Code exits unexpectedly (crash, network drop, Ctrl+C), you can resume:

```bash
# Resume the most recent session
claude --resume

# Continue the last conversation
claude -c

# Resume a specific session by ID
claude --resume SESSION_ID
```

Session state is persisted. Resuming picks up where it left off with full context.

## Wrong Changes Made

If Claude Code made incorrect edits, use git to revert:

```bash
# Revert a specific file
git checkout -- path/to/file.js

# Stash all changes (keeps them recoverable)
git stash

# Hard reset to last commit (destructive — discards all changes)
git reset --hard HEAD

# Revert to a specific commit
git checkout abc123 -- path/to/file.js
```

**Best practice:** Always commit before running Claude Code on important code. This gives you a clean revert point.

```bash
git add -A && git commit -m "checkpoint before Claude Code"
claude -p "refactor the auth module" --cwd ~/Code/project/
# If things go wrong:
git diff  # Review what changed
git checkout -- .  # Revert everything
```

## Claude Code Stuck in a Loop

If Claude Code keeps retrying the same failing approach:

1. Press `Ctrl+C` to cancel the current operation
2. Try a different prompt — rephrase the task or provide more specific instructions
3. Add constraints: "Do NOT use approach X, instead try Y"
4. Start a fresh session — the old context may be leading it astray

```bash
# Start fresh with clearer instructions
claude -p "Fix the login bug. The issue is in auth.js line 45. Use try/catch, not .catch()" --cwd ~/Code/project/
```

## Context Too Full

When Claude Code's context window fills up, it may lose track of earlier information:

```bash
# In interactive mode
/compact           # Summarize and compress the conversation
/compact "Focus on the auth refactoring task"  # Compact with guidance
/clear             # Start completely fresh (loses all context)
```

For programmatic usage, use `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` to auto-compact:

```bash
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60  # Compact at 60% usage
```

## Hook Blocking Valid Operations

If hooks are incorrectly blocking operations Claude Code needs to perform:

1. Review the hook script — check the matching logic
2. Test the hook manually with the exact input that's being blocked
3. Adjust matchers — make patterns more specific
4. Temporarily disable all hooks:

```json
{
  "hooks": {
    "disableAllHooks": true
  }
}
```

5. Or disable a specific hook by removing it from settings
6. Re-enable hooks after fixing the issue

## Model Overloaded

When the primary model is overloaded (500/529 errors):

```bash
# Use fallback model for automatic failover
claude -p "task" --fallback-model claude-haiku-3-5-20241022

# Or switch to a different model entirely
ANTHROPIC_MODEL=claude-sonnet-4-20250514 claude -p "task"
```

## Worktree Issues

Claude Code can create git worktrees for parallel work. If stale worktrees accumulate:

```bash
# List worktrees
ls .claude/worktrees/

# Clean up stale worktrees
git worktree list
git worktree prune

# Remove a specific worktree
git worktree remove .claude/worktrees/stale-one
```

## For Maestro Orchestration

Implement a retry strategy with escalating recovery:

```javascript
async function runWithRecovery(task, projectDir, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await runClaudeCode(task, projectDir);

    if (result.success) return result;

    switch (result.error) {
      case 'rate_limit':
        // Wait with exponential backoff
        await sleep(Math.pow(2, attempt) * 30000);
        break;

      case 'max_turns':
        // Resume the session to continue
        return await resumeSession(result.sessionId);

      case 'context_overflow':
        // Start fresh with a more focused prompt
        task = simplifyTask(task);
        break;

      case 'model_overloaded':
        // Fall back to a different model
        return await runClaudeCode(task, projectDir, {
          model: 'claude-haiku-3-5-20241022'
        });

      default:
        // Unknown error — log and retry
        console.error(`Attempt ${attempt + 1} failed:`, result.error);
    }
  }

  throw new Error(`Task failed after ${maxRetries} attempts`);
}
```

**Golden rule:** Always use git. Commit before running Claude Code. You can always revert.
