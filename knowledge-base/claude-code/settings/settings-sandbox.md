---
title: "OS-level sandboxing configuration"
category: "settings"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/settings"
last_verified: "2026-03-22"
content_hash: ""
---

# Sandbox Configuration

Claude Code supports OS-level sandboxing to restrict filesystem access, network access, and subprocess behavior. This provides defense-in-depth beyond permission rules.

## Full Configuration

```json
{
  "sandbox": {
    "enabled": true,
    "mode": "auto-allow",
    "filesystem": {
      "allowWrite": ["."],
      "denyWrite": ["/etc", "/usr", "/System"],
      "allowRead": ["."],
      "denyRead": ["~/secrets", "~/.ssh/id_*"]
    },
    "network": {
      "allowedDomains": ["github.com", "npmjs.org", "registry.npmjs.org", "api.anthropic.com"],
      "allowManagedDomainsOnly": false
    },
    "excludedCommands": ["docker", "podman"],
    "allowUnsandboxedCommands": true
  }
}
```

## Configuration Fields

### enabled
**Type:** `boolean`

Enables or disables sandboxing entirely. When `false`, no OS-level restrictions are applied.

### mode
**Type:** `string`

- `"auto-allow"` — sandbox is active but does not prompt on allowed operations. Blocked operations fail silently or with an error.
- Other modes may prompt or log when sandbox boundaries are hit.

### filesystem

Controls which paths can be read from and written to at the OS level.

```json
{
  "filesystem": {
    "allowWrite": ["."],
    "denyWrite": ["/etc", "/usr"],
    "allowRead": ["."],
    "denyRead": ["~/secrets"]
  }
}
```

- `"."` refers to the project working directory and its subdirectories
- Paths can be absolute (`/etc`), home-relative (`~/secrets`), or project-relative (`.`)
- Deny rules take precedence over allow rules
- These are OS-enforced restrictions — they cannot be bypassed by spawned subprocesses

### network

Controls which domains can be accessed over the network.

```json
{
  "network": {
    "allowedDomains": ["github.com", "npmjs.org", "api.anthropic.com"],
    "allowManagedDomainsOnly": false
  }
}
```

- `allowedDomains` — list of domains that outbound connections are permitted to
- `allowManagedDomainsOnly` — when `true`, only domains specified in managed settings are allowed. Project and user settings cannot add more domains.

### excludedCommands

Commands that are exempt from sandboxing. These commands run without filesystem or network restrictions.

```json
{
  "excludedCommands": ["docker", "podman", "nix"]
}
```

Use this for commands that need broad system access and cannot function within the sandbox (e.g., container runtimes).

### allowUnsandboxedCommands

**Type:** `boolean`

When `true`, commands listed in `excludedCommands` are allowed to run unsandboxed. When `false`, excluded commands are blocked entirely rather than running unsandboxed.

## Platform Implementation

### macOS — Seatbelt Framework

On macOS, sandboxing uses Apple's Seatbelt (sandbox-exec) framework. This provides kernel-level enforcement of filesystem and network access rules. Claude Code generates a Seatbelt profile from the sandbox configuration and applies it to all spawned processes.

Benefits:
- Kernel-enforced — cannot be bypassed by user-space code
- Applies to all child processes recursively
- Low overhead

### Linux — bubblewrap + socat

On Linux, sandboxing uses bubblewrap (bwrap) for filesystem isolation and socat for network proxying.

Benefits:
- Namespace-based isolation (similar to containers)
- Fine-grained filesystem mount control
- Network filtering via socat proxy

## Benefits of Sandboxing

1. **Filesystem isolation** — prevents Claude from reading or writing files outside the allowed paths, even via spawned subprocesses like `bash -c "cat /etc/passwd"`.

2. **Network isolation** — prevents exfiltration of code or secrets to unauthorized domains. Only whitelisted domains can be reached.

3. **Subprocess enforcement** — restrictions apply to all child processes, not just Claude's direct tool calls. A `Bash` command that spawns further processes inherits the sandbox.

4. **Reduced permission prompts** — when the sandbox is active, many operations that would normally require a permission prompt can be auto-allowed because the sandbox provides the safety guarantee.

## Example: Minimal Sandbox for a Web Project

```json
{
  "sandbox": {
    "enabled": true,
    "mode": "auto-allow",
    "filesystem": {
      "allowWrite": ["."],
      "denyWrite": ["/", "~/.ssh", "~/.aws", "~/.config"],
      "allowRead": [".", "~/.npmrc"],
      "denyRead": ["~/.ssh", "~/.aws", "~/secrets"]
    },
    "network": {
      "allowedDomains": [
        "registry.npmjs.org",
        "github.com",
        "api.anthropic.com"
      ]
    },
    "excludedCommands": [],
    "allowUnsandboxedCommands": false
  }
}
```

This configuration:
- Allows reads and writes only within the project directory
- Allows reading `.npmrc` for package registry auth
- Blocks access to SSH keys, AWS credentials, and secrets
- Only allows network access to npm, GitHub, and the Anthropic API
- No commands are excluded from sandboxing
