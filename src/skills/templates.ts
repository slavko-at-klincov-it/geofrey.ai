import type { SkillFrontmatter } from "./format.js";

export interface SkillTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  frontmatter: SkillFrontmatter;
  instructions: string;
}

export const SKILL_TEMPLATE_CATEGORIES = [
  "smart-home",
  "productivity",
  "media",
  "development",
  "communication",
  "utilities",
] as const;

export type SkillTemplateCategory = typeof SKILL_TEMPLATE_CATEGORIES[number];

const TEMPLATES: SkillTemplate[] = [
  {
    id: "smart-home-hue",
    name: "Philips Hue Control",
    category: "smart-home",
    description: "Control Philips Hue lights — on/off, brightness, color, scenes",
    frontmatter: {
      name: "hue-control",
      emoji: "💡",
      description: "Control Philips Hue lights — on/off, brightness, color, scenes",
      version: "1.0.0",
      dependencies: ["web_fetch"],
      permissions: {
        filesystem: "none",
        network: "local",
        env: "read",
        exec: "none",
      },
    },
    instructions: `You can control Philips Hue lights via the local Hue Bridge API.

## Setup
The user must set HUE_BRIDGE_IP and HUE_API_KEY in their environment.

## Commands
- **Turn on/off**: PUT to http://{bridge}/api/{key}/lights/{id}/state with {"on": true/false}
- **Set brightness**: PUT with {"bri": 0-254}
- **Set color**: PUT with {"hue": 0-65535, "sat": 0-254}
- **List lights**: GET http://{bridge}/api/{key}/lights
- **Set scene**: PUT to http://{bridge}/api/{key}/groups/{group}/action with {"scene": "sceneId"}

## Safety
- Always confirm before turning off all lights
- Never change lights between 23:00 and 06:00 unless explicitly asked`,
  },
  {
    id: "smart-home-ha",
    name: "HomeAssistant",
    category: "smart-home",
    description: "Interact with HomeAssistant — devices, automations, sensors",
    frontmatter: {
      name: "homeassistant",
      emoji: "🏠",
      description: "Interact with HomeAssistant — devices, automations, sensors",
      version: "1.0.0",
      dependencies: ["web_fetch"],
      permissions: {
        filesystem: "none",
        network: "local",
        env: "read",
        exec: "none",
      },
    },
    instructions: `You can interact with HomeAssistant via its REST API.

## Setup
The user must set HA_URL (e.g. http://homeassistant.local:8123) and HA_TOKEN (long-lived access token).

## Commands
- **List entities**: GET {HA_URL}/api/states (Authorization: Bearer {HA_TOKEN})
- **Get entity state**: GET {HA_URL}/api/states/{entity_id}
- **Call service**: POST {HA_URL}/api/services/{domain}/{service} with entity_id in body
- **Fire event**: POST {HA_URL}/api/events/{event_type}

## Common services
- light.turn_on, light.turn_off
- switch.turn_on, switch.turn_off
- climate.set_temperature
- media_player.media_play, media_player.media_pause

## Safety
- Always confirm before executing automations that affect multiple devices
- Never disable security-related entities (alarm, locks) without explicit approval`,
  },
  {
    id: "productivity-todoist",
    name: "Todoist Task Management",
    category: "productivity",
    description: "Manage Todoist tasks — create, complete, list, organize projects",
    frontmatter: {
      name: "todoist",
      emoji: "✅",
      description: "Manage Todoist tasks — create, complete, list, organize projects",
      version: "1.0.0",
      dependencies: ["web_fetch"],
      permissions: {
        filesystem: "none",
        network: "full",
        env: "read",
        exec: "none",
      },
    },
    instructions: `You can manage Todoist tasks via the Todoist REST API v2.

## Setup
The user must set TODOIST_API_KEY in their environment.

## API Base
https://api.todoist.com/rest/v2

## Commands
- **List tasks**: GET /tasks (filter with ?project_id= or ?filter=)
- **Create task**: POST /tasks with {"content": "...", "due_string": "tomorrow", "priority": 1-4}
- **Complete task**: POST /tasks/{id}/close
- **Update task**: POST /tasks/{id} with updated fields
- **List projects**: GET /projects
- **Create project**: POST /projects with {"name": "..."}

## Authorization
All requests need: Authorization: Bearer {TODOIST_API_KEY}

## Best practices
- When creating tasks, always ask for due date if not specified
- Use priority 4 (urgent) sparingly
- Group related tasks into projects`,
  },
  {
    id: "media-spotify",
    name: "Spotify Playback Control",
    category: "media",
    description: "Control Spotify playback — play, pause, skip, search, playlists",
    frontmatter: {
      name: "spotify",
      emoji: "🎵",
      description: "Control Spotify playback — play, pause, skip, search, playlists",
      version: "1.0.0",
      dependencies: ["web_fetch"],
      permissions: {
        filesystem: "none",
        network: "full",
        env: "read",
        exec: "none",
      },
    },
    instructions: `You can control Spotify playback via the Spotify Web API.

## Setup
The user must set SPOTIFY_ACCESS_TOKEN in their environment.
Note: Spotify tokens expire — the user may need to refresh periodically.

## API Base
https://api.spotify.com/v1

## Commands
- **Play**: PUT /me/player/play with {"uris": ["spotify:track:..."]}
- **Pause**: PUT /me/player/pause
- **Skip**: POST /me/player/next
- **Previous**: POST /me/player/previous
- **Search**: GET /search?q={query}&type=track,artist,album
- **Current track**: GET /me/player/currently-playing
- **Set volume**: PUT /me/player/volume?volume_percent=50
- **Get playlists**: GET /me/playlists

## Authorization
All requests need: Authorization: Bearer {SPOTIFY_ACCESS_TOKEN}

## Best practices
- Search before playing to confirm the right track
- Report current track info after play/skip commands`,
  },
  {
    id: "dev-github",
    name: "GitHub Workflow Automation",
    category: "development",
    description: "Automate GitHub workflows — issues, PRs, releases, actions",
    frontmatter: {
      name: "github-workflow",
      emoji: "🐙",
      description: "Automate GitHub workflows — issues, PRs, releases, actions",
      version: "1.0.0",
      dependencies: ["web_fetch", "shell"],
      permissions: {
        filesystem: "read",
        network: "full",
        env: "read",
        exec: "restricted",
      },
    },
    instructions: `You can automate GitHub workflows using the GitHub REST API and git CLI.

## Setup
The user must set GITHUB_TOKEN in their environment (Personal Access Token or fine-grained token).

## API Base
https://api.github.com

## API Commands
- **List issues**: GET /repos/{owner}/{repo}/issues
- **Create issue**: POST /repos/{owner}/{repo}/issues with {"title": "...", "body": "..."}
- **Create PR**: POST /repos/{owner}/{repo}/pulls with {"title": "...", "head": "...", "base": "main"}
- **List PRs**: GET /repos/{owner}/{repo}/pulls
- **Merge PR**: PUT /repos/{owner}/{repo}/pulls/{number}/merge
- **Trigger workflow**: POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches
- **List releases**: GET /repos/{owner}/{repo}/releases

## Authorization
All API requests need: Authorization: Bearer {GITHUB_TOKEN}

## Git CLI
Use shell tool for git operations: git status, git add, git commit, git push, git branch

## Safety
- Never force push without explicit user approval
- Always show diff before committing
- Confirm before merging PRs`,
  },
];

/**
 * Get all built-in skill templates.
 */
export function getAllTemplates(): SkillTemplate[] {
  return [...TEMPLATES];
}

/**
 * Get a template by its ID.
 */
export function getTemplateById(id: string): SkillTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * Search templates by query string (matches against name, description, category).
 */
export function searchTemplates(query: string): SkillTemplate[] {
  const lower = query.toLowerCase();
  return TEMPLATES.filter(
    (t) =>
      t.id.includes(lower) ||
      t.name.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower) ||
      t.category.includes(lower),
  );
}

/**
 * List templates filtered by category.
 */
export function getTemplatesByCategory(category: string): SkillTemplate[] {
  return TEMPLATES.filter((t) => t.category === category);
}
