---
title: "OS-level sandboxing for Claude Code sessions"
category: "safety"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/security"
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
last_verified: "2026-03-22"
content_hash: ""
---

# OS-Level Sandboxing

Claude Code supports OS-level sandboxing that restricts filesystem access and network connectivity for all commands it runs, including child processes.

## Enabling the Sandbox

In your settings (project or global):

```json
{
  "sandbox": {
    "enabled": true
  }
}
```

Or in the global settings file at `~/.claude/settings.json`.

## Filesystem Isolation

Control which paths Claude Code can read and write:

```json
{
  "sandbox": {
    "enabled": true,
    "allowRead": [
      "/Users/me/Code/my-project",
      "/usr/local/lib"
    ],
    "denyRead": [
      "/Users/me/.ssh",
      "/Users/me/.aws",
      "/Users/me/.gnupg"
    ],
    "allowWrite": [
      "/Users/me/Code/my-project"
    ],
    "denyWrite": [
      "/Users/me/Code/my-project/.env",
      "/Users/me/Code/my-project/secrets"
    ]
  }
}
```

- `allowRead` — paths Claude Code can read (default: cwd and standard system paths)
- `denyRead` — paths explicitly blocked from reading
- `allowWrite` — paths Claude Code can write to (default: cwd)
- `denyWrite` — paths explicitly blocked from writing
- Deny rules take precedence over allow rules

## Network Isolation

Whitelist specific domains Claude Code can access:

```json
{
  "sandbox": {
    "enabled": true,
    "allowedDomains": [
      "registry.npmjs.org",
      "api.github.com",
      "pypi.org"
    ]
  }
}
```

All network requests to domains not in the whitelist are blocked at the OS level. This prevents data exfiltration and unexpected downloads.

## Platform-Specific Implementation

### macOS — Seatbelt Framework

On macOS, the sandbox uses Apple's Seatbelt (sandbox-exec) framework. This is a kernel-level restriction — processes cannot bypass it. No additional installation is required.

### Linux — bubblewrap + socat

On Linux, the sandbox uses bubblewrap for filesystem/process isolation and socat for network proxying.

Install dependencies:

```bash
sudo apt-get install bubblewrap socat
```

Both must be installed for the sandbox to function on Linux.

## Excluded Commands

Some commands need to bypass the sandbox (e.g., Docker, which manages its own isolation):

```json
{
  "sandbox": {
    "enabled": true,
    "excludedCommands": [
      "docker",
      "docker-compose",
      "podman"
    ]
  }
}
```

These commands run outside sandbox restrictions. Use sparingly and only for tools that provide their own isolation.

## Permission Mode with Sandbox

Combine sandbox with auto-allow mode to reduce permission prompts while maintaining safety:

```json
{
  "permissions": {
    "mode": "auto-allow"
  },
  "sandbox": {
    "enabled": true,
    "allowWrite": ["/Users/me/Code/my-project"],
    "allowedDomains": ["registry.npmjs.org"]
  }
}
```

With this configuration:
- Claude Code auto-approves tool calls (no permission prompts)
- The OS-level sandbox enforces the actual boundaries
- Even if Claude Code tries something dangerous, the sandbox blocks it

## All Child Processes Inherit Restrictions

The sandbox applies not just to direct commands but to every child process. If Claude Code runs `npm install`, the npm process and all its child processes are sandboxed. They cannot read, write, or connect to anything outside the allowed scope.

## Best Practice for Maestro

Enable sandbox for every Claude Code session you spawn:

```javascript
// When generating settings for a session
const settings = {
  sandbox: {
    enabled: true,
    allowRead: [projectDir, '/usr/local/lib', '/usr/lib'],
    allowWrite: [projectDir],
    denyRead: [
      path.join(os.homedir(), '.ssh'),
      path.join(os.homedir(), '.aws'),
      path.join(os.homedir(), '.gnupg')
    ],
    allowedDomains: [
      'registry.npmjs.org',
      'api.github.com'
    ]
  }
};
```

This ensures that even if a prompt injection or unexpected behavior occurs, the damage is contained to the project directory.
