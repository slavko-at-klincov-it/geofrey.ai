---
title: "Chrome Browser Integration for Testing and Automation"
category: "cli"
source_urls:
  - "https://docs.anthropic.com/en/docs/claude-code/cli-reference"
last_verified: "2026-03-22"
content_hash: ""
---

# Chrome Browser Integration

Claude Code can control a Chrome browser to test web applications, automate workflows, and visually verify frontend changes.

## Enabling Chrome Integration

```bash
# From the command line
claude --chrome

# Inside a session
/chrome
```

## What Claude Can Do With Chrome

- **Take screenshots** — capture the current state of a page for visual verification
- **Click elements** — interact with buttons, links, menus
- **Fill forms** — type into inputs, select dropdowns, check boxes
- **Extract data** — read text, attributes, and structured content from pages
- **Read console logs** — access browser developer console output for debugging
- **Navigate** — go to URLs, follow links, handle redirects

## Use Cases

**Test a local web application end-to-end:**
```
> Start the dev server and test the login flow
```
Claude launches Chrome, navigates to localhost, fills in credentials, submits the form, and verifies the result page.

**Visual verification of frontend changes:**
```
> Open the dashboard page and verify the new chart component renders correctly
```
Claude takes a screenshot and describes what it sees, confirming the component appears as expected.

**Automate multi-site workflows:**
```
> Go to the staging URL, log in, create a test user, then verify the user appears in the admin panel
```

**Debug with console access:**
```
> Open the app and check if there are any JavaScript errors in the console
```

**Record demo GIFs:**
Claude can capture a sequence of interactions to produce a visual walkthrough of a feature.

## Permissions

Chrome integration manages site permissions per domain. Claude will request permission before navigating to new domains.

## Combining With Other Flags

```bash
# Test a specific project's frontend
claude --chrome --cwd /path/to/my-web-app

# Automated testing in print mode
claude -p "test the signup flow and report any issues" --chrome
```

## Key Points

- Chrome integration gives Claude eyes and hands in the browser.
- Combine with `--cwd` to scope testing to a specific project.
- Useful for both manual verification and automated end-to-end testing.
- Console log access makes it a powerful debugging tool for frontend issues.
