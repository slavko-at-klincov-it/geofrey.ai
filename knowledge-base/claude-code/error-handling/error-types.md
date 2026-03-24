---
title: "Common Claude Code error types and solutions"
category: "error-handling"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/troubleshooting"
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Common Claude Code Error Types

## Rate Limiting

**Symptoms:** Request fails with rate_limit error or StopFailure with rate_limit matcher. Claude Code may pause or abort.

**Solutions:**
- Wait and retry — rate limits are temporary (usually 60 seconds)
- Use `--fallback-model` to automatically switch to a different model when rate-limited
- Reduce parallel sessions if running multiple Claude Code instances
- Upgrade API tier for higher rate limits

```bash
# Automatic fallback on rate limit
claude -p "task" --fallback-model claude-haiku-3-5-20241022
```

## Authentication Failed

**Symptoms:** Error mentioning invalid API key, unauthorized, or 401 status.

**Solutions:**
- Check ANTHROPIC_API_KEY is set and valid: `echo $ANTHROPIC_API_KEY`
- Re-login: `claude login`
- Verify the key hasn't been revoked in the Anthropic Console
- If using a proxy (ANTHROPIC_BASE_URL), verify proxy auth is configured

## Billing Error

**Symptoms:** Error about account limits, insufficient credits, or payment required.

**Solutions:**
- Check account status: run `/status` in interactive mode
- Add credits or update payment method in Anthropic Console
- Check if you've hit a spending limit you configured

## Context Overflow

**Symptoms:** Claude Code loses track of earlier context, repeats itself, or errors about context length.

**Solutions:**
- Auto-compaction should handle this automatically (set CLAUDE_AUTOCOMPACT_PCT_OVERRIDE)
- Manually compact: run `/compact` in interactive mode
- Start a new session if context is too polluted
- Break large tasks into smaller subtasks

## Tool Permission Denied

**Symptoms:** Claude Code reports a tool call was denied by the user or by permissions config.

**Solutions:**
- Check `allowedTools` in settings if using programmatic mode
- Adjust `permissions.allow` and `permissions.deny` in `.claude/settings.json`
- Use `--allowedTools` CLI flag to grant specific tools
- In interactive mode, approve the permission when prompted

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Read",
      "Edit",
      "Write"
    ]
  }
}
```

## MCP Server Timeout

**Symptoms:** MCP tool calls fail with timeout errors, or MCP server doesn't start.

**Solutions:**
- Increase `MCP_TIMEOUT` (startup timeout): `export MCP_TIMEOUT=60000`
- Increase `MCP_TOOL_TIMEOUT` (execution timeout): `export MCP_TOOL_TIMEOUT=120000`
- Verify the MCP server is running and reachable
- Check MCP server logs for errors
- Restart the MCP server

## Hook Failure

**Symptoms:** Hook returned a non-zero, non-2 exit code. Claude Code shows a warning.

**Solutions:**
- Exit code 0 = allow, exit code 2 = block. Any other code = hook error.
- Check the hook script for bugs — review stderr output
- Test the hook script manually with sample input
- Temporarily disable hooks to verify it's a hook issue: set `disableAllHooks: true` in settings

```bash
# Test a hook manually
echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | /path/to/hook.sh
echo $?  # Should be 0 or 2
```

## Max Turns Reached

**Symptoms:** Claude Code stops before completing the task, mentioning turn limit.

**Solutions:**
- Increase `--max-turns`: `claude -p "task" --max-turns 50`
- Remove the limit for complex tasks: don't set --max-turns
- Break the task into smaller subtasks
- Default is usually sufficient; hitting it suggests the task needs restructuring

## Max Budget Reached

**Symptoms:** Claude Code stops, mentioning budget limit.

**Solutions:**
- Increase `--max-budget-usd`: `claude -p "task" --max-budget-usd 10.00`
- Review why the task consumed so much budget (context too large? too many tool calls?)
- Use a cheaper model for routine tasks

## For Maestro Orchestration

When handling errors programmatically, parse Claude Code's exit status and stderr:

```javascript
const child = spawn('claude', ['-p', task, '--output-format', 'json', '--cwd', dir]);

child.on('close', (code) => {
  if (code !== 0) {
    // Parse the JSON output for error details
    const result = JSON.parse(stdout);
    if (result.stop_reason === 'rate_limit') {
      // Wait and retry
      setTimeout(() => retry(task), 60000);
    } else if (result.stop_reason === 'max_turns') {
      // Continue the session
      spawn('claude', ['--resume', result.session_id]);
    }
  }
});
```
