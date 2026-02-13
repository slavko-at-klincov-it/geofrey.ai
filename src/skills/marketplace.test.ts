import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeSha256 } from "./verification.js";
import {
  fetchMarketplaceIndex,
  searchMarketplace,
  listMarketplace,
  installFromMarketplace,
  listTemplates,
  createFromTemplate,
  searchSkillTemplates,
  _resetCache,
} from "./marketplace.js";

// --- Test fixtures ---

const VALID_SKILL_MD = `---
name: test-skill
description: A test marketplace skill
version: 1.0.0
permissions:
  filesystem: none
  network: none
  env: none
  exec: none
---

Follow these instructions for the test skill.`;

const VALID_SKILL_HASH = computeSha256(VALID_SKILL_MD);

function buildIndex(skills: Array<Record<string, unknown>> = []) {
  return JSON.stringify({
    version: "1",
    skills: skills.length > 0
      ? skills
      : [
          {
            id: "test-skill",
            name: "Test Skill",
            description: "A test marketplace skill",
            category: "utilities",
            version: "1.0.0",
            hash: VALID_SKILL_HASH,
            author: "Test Author",
          },
          {
            id: "hue-lights",
            name: "Hue Lights",
            description: "Control Philips Hue lights",
            category: "smart-home",
            version: "2.0.0",
            hash: "b".repeat(64),
          },
        ],
  });
}

// --- Test HTTP server ---

function createTestServer(
  routes: Record<string, { status: number; body: string; contentType?: string }>,
): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const route = routes[req.url ?? ""];
      if (route) {
        res.writeHead(route.status, { "Content-Type": route.contentType ?? "text/plain" });
        res.end(route.body);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
      }
    });
  });
}

// --- Tests ---

let tempDir: string;

describe("skills/marketplace - fetchMarketplaceIndex", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "marketplace-test-"));
    _resetCache();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("fetches and parses valid index", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
    });

    try {
      const result = await fetchMarketplaceIndex({ baseUrl });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.index.skills.length, 2);
        assert.equal(result.index.skills[0].id, "test-skill");
      }
    } finally {
      server.close();
    }
  });

  it("returns error for HTTP failure", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": { status: 500, body: "Internal Server Error" },
    });

    try {
      const result = await fetchMarketplaceIndex({ baseUrl });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.includes("500"));
      }
    } finally {
      server.close();
    }
  });

  it("returns error for invalid JSON", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": { status: 200, body: "not json!" },
    });

    try {
      const result = await fetchMarketplaceIndex({ baseUrl });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.includes("not valid JSON"));
      }
    } finally {
      server.close();
    }
  });

  it("returns error for invalid index schema", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: JSON.stringify({ version: "1", skills: [{ missing: "fields" }] }),
        contentType: "application/json",
      },
    });

    try {
      const result = await fetchMarketplaceIndex({ baseUrl });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.includes("Invalid marketplace index format"));
      }
    } finally {
      server.close();
    }
  });

  it("caches the index on second call", async () => {
    let fetchCount = 0;
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
    });

    // Patch server to count requests
    const origHandler = server.listeners("request")[0] as (...args: unknown[]) => void;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      fetchCount++;
      origHandler(req, res);
    });

    try {
      const result1 = await fetchMarketplaceIndex({ baseUrl });
      assert.equal(result1.ok, true);
      assert.equal(fetchCount, 1);

      const result2 = await fetchMarketplaceIndex({ baseUrl });
      assert.equal(result2.ok, true);
      assert.equal(fetchCount, 1); // Cached, no second fetch
    } finally {
      server.close();
    }
  });

  it("forceRefresh bypasses cache", async () => {
    let fetchCount = 0;
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
    });

    const origHandler = server.listeners("request")[0] as (...args: unknown[]) => void;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      fetchCount++;
      origHandler(req, res);
    });

    try {
      await fetchMarketplaceIndex({ baseUrl });
      assert.equal(fetchCount, 1);

      await fetchMarketplaceIndex({ baseUrl, forceRefresh: true });
      assert.equal(fetchCount, 2);
    } finally {
      server.close();
    }
  });

  it("returns error for unreachable server", async () => {
    const result = await fetchMarketplaceIndex({ baseUrl: "http://127.0.0.1:1" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes("Failed to fetch marketplace index"));
    }
  });
});

describe("skills/marketplace - searchMarketplace", () => {
  beforeEach(() => {
    _resetCache();
  });

  it("finds skills matching query", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
    });

    try {
      const result = await searchMarketplace("test", { baseUrl });
      assert.ok(result.includes("test-skill"));
      assert.ok(result.includes("1 skill(s)"));
    } finally {
      server.close();
    }
  });

  it("finds skills matching category", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
    });

    try {
      const result = await searchMarketplace("smart-home", { baseUrl });
      assert.ok(result.includes("hue-lights"));
    } finally {
      server.close();
    }
  });

  it("returns no-match message for unknown query", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
    });

    try {
      const result = await searchMarketplace("zzz-nonexistent", { baseUrl });
      assert.ok(result.includes("No marketplace skills found"));
    } finally {
      server.close();
    }
  });

  it("returns error when index fetch fails", async () => {
    const result = await searchMarketplace("test", { baseUrl: "http://127.0.0.1:1" });
    assert.ok(result.startsWith("Error:"));
  });
});

describe("skills/marketplace - listMarketplace", () => {
  beforeEach(() => {
    _resetCache();
  });

  it("lists all marketplace skills grouped by category", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
    });

    try {
      const result = await listMarketplace({ baseUrl });
      assert.ok(result.includes("2 total"));
      assert.ok(result.includes("utilities"));
      assert.ok(result.includes("smart-home"));
      assert.ok(result.includes("test-skill"));
      assert.ok(result.includes("hue-lights"));
    } finally {
      server.close();
    }
  });

  it("filters by category", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
    });

    try {
      const result = await listMarketplace({ baseUrl, category: "smart-home" });
      assert.ok(result.includes("hue-lights"));
      assert.ok(!result.includes("test-skill"));
    } finally {
      server.close();
    }
  });

  it("returns empty message for unknown category", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
    });

    try {
      const result = await listMarketplace({ baseUrl, category: "nonexistent" });
      assert.ok(result.includes("No skills available"));
    } finally {
      server.close();
    }
  });
});

describe("skills/marketplace - installFromMarketplace", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "marketplace-install-"));
    _resetCache();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("installs a skill with hash verification", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
      "/utilities/test-skill/SKILL.md": {
        status: 200,
        body: VALID_SKILL_MD,
      },
      "/utilities/test-skill/checksum.sha256": {
        status: 200,
        body: VALID_SKILL_HASH,
      },
    });

    try {
      const result = await installFromMarketplace("test-skill", {
        baseUrl,
        installDir: tempDir,
      });

      assert.ok(result.includes("Installed"));
      assert.ok(result.includes("Test Skill"));
      assert.ok(!result.includes("SKIPPED"));

      // Verify file was written (flat file, not subdirectory)
      const filePath = join(tempDir, "test-skill.md");
      const content = await readFile(filePath, "utf-8");
      assert.equal(content, VALID_SKILL_MD);
    } finally {
      server.close();
    }
  });

  it("installs with sha256sum format checksum", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
      "/utilities/test-skill/SKILL.md": {
        status: 200,
        body: VALID_SKILL_MD,
      },
      "/utilities/test-skill/checksum.sha256": {
        status: 200,
        body: `${VALID_SKILL_HASH}  SKILL.md\n`,
      },
    });

    try {
      const result = await installFromMarketplace("test-skill", {
        baseUrl,
        installDir: tempDir,
      });
      assert.ok(result.includes("Installed"));
    } finally {
      server.close();
    }
  });

  it("rejects skill with hash mismatch", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
      "/utilities/test-skill/SKILL.md": {
        status: 200,
        body: VALID_SKILL_MD + "\n<!-- tampered -->",
      },
      "/utilities/test-skill/checksum.sha256": {
        status: 200,
        body: VALID_SKILL_HASH,
      },
    });

    try {
      const result = await installFromMarketplace("test-skill", {
        baseUrl,
        installDir: tempDir,
      });
      assert.ok(result.includes("Error:"));
      assert.ok(result.includes("Hash verification failed") || result.includes("hash verification failed"));
      assert.ok(result.includes("NOT installed"));
    } finally {
      server.close();
    }
  });

  it("skips hash verification when verifyHashes is false", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
      "/utilities/test-skill/SKILL.md": {
        status: 200,
        body: VALID_SKILL_MD,
      },
    });

    try {
      const result = await installFromMarketplace("test-skill", {
        baseUrl,
        installDir: tempDir,
        verifyHashes: false,
      });
      assert.ok(result.includes("Installed"));
      assert.ok(result.includes("SKIPPED"));
    } finally {
      server.close();
    }
  });

  it("returns error for unknown skill id", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
    });

    try {
      const result = await installFromMarketplace("nonexistent", {
        baseUrl,
        installDir: tempDir,
      });
      assert.ok(result.includes("Error:"));
      assert.ok(result.includes("not found in marketplace"));
    } finally {
      server.close();
    }
  });

  it("returns error when SKILL.md download fails", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
      "/utilities/test-skill/SKILL.md": {
        status: 404,
        body: "Not Found",
      },
    });

    try {
      const result = await installFromMarketplace("test-skill", {
        baseUrl,
        installDir: tempDir,
      });
      assert.ok(result.includes("Error:"));
      assert.ok(result.includes("Failed to download"));
    } finally {
      server.close();
    }
  });

  it("returns error when checksum download fails", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
      "/utilities/test-skill/SKILL.md": {
        status: 200,
        body: VALID_SKILL_MD,
      },
      "/utilities/test-skill/checksum.sha256": {
        status: 404,
        body: "Not Found",
      },
    });

    try {
      const result = await installFromMarketplace("test-skill", {
        baseUrl,
        installDir: tempDir,
      });
      assert.ok(result.includes("Error:"));
      assert.ok(result.includes("Failed to download checksum"));
    } finally {
      server.close();
    }
  });

  it("returns error for invalid SKILL.md format", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
      "/utilities/test-skill/SKILL.md": {
        status: 200,
        body: "not a valid skill file",
      },
    });

    try {
      const result = await installFromMarketplace("test-skill", {
        baseUrl,
        installDir: tempDir,
        verifyHashes: false,
      });
      assert.ok(result.includes("Error:"));
      assert.ok(result.includes("invalid format"));
    } finally {
      server.close();
    }
  });

  it("returns error for invalid checksum file format", async () => {
    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: buildIndex(),
        contentType: "application/json",
      },
      "/utilities/test-skill/SKILL.md": {
        status: 200,
        body: VALID_SKILL_MD,
      },
      "/utilities/test-skill/checksum.sha256": {
        status: 200,
        body: "not a valid checksum",
      },
    });

    try {
      const result = await installFromMarketplace("test-skill", {
        baseUrl,
        installDir: tempDir,
      });
      assert.ok(result.includes("Error:"));
      assert.ok(result.includes("Invalid checksum file format"));
    } finally {
      server.close();
    }
  });

  it("rejects when checksum file matches but index hash does not", async () => {
    // Checksum file hash matches the content, but index has a different hash
    const differentHashIndex = JSON.stringify({
      version: "1",
      skills: [
        {
          id: "test-skill",
          name: "Test Skill",
          description: "A test marketplace skill",
          category: "utilities",
          version: "1.0.0",
          hash: "a".repeat(64), // Different from actual content hash
        },
      ],
    });

    const { server, baseUrl } = await createTestServer({
      "/index.json": {
        status: 200,
        body: differentHashIndex,
        contentType: "application/json",
      },
      "/utilities/test-skill/SKILL.md": {
        status: 200,
        body: VALID_SKILL_MD,
      },
      "/utilities/test-skill/checksum.sha256": {
        status: 200,
        body: VALID_SKILL_HASH,
      },
    });

    try {
      const result = await installFromMarketplace("test-skill", {
        baseUrl,
        installDir: tempDir,
      });
      assert.ok(result.includes("Error:"));
      assert.ok(result.includes("Index hash verification failed"));
    } finally {
      server.close();
    }
  });
});

describe("skills/marketplace - listTemplates", () => {
  it("lists all available templates", () => {
    const result = listTemplates();
    assert.ok(result.includes("Available skill templates"));
    assert.ok(result.includes("smart-home-hue"));
    assert.ok(result.includes("smart-home-ha"));
    assert.ok(result.includes("productivity-todoist"));
    assert.ok(result.includes("media-spotify"));
    assert.ok(result.includes("dev-github"));
  });

  it("includes template count", () => {
    const result = listTemplates();
    // At least 5 templates
    assert.ok(/\(\d+\)/.test(result));
  });
});

describe("skills/marketplace - createFromTemplate", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "marketplace-template-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates skill file from template", async () => {
    const result = await createFromTemplate("smart-home-hue", { outputDir: tempDir });
    assert.ok(result.includes("Created skill"));
    assert.ok(result.includes("Philips Hue Control"));

    // Verify file content
    const filePath = join(tempDir, "hue-control.md");
    const content = await readFile(filePath, "utf-8");
    assert.ok(content.includes("name: hue-control"));
    assert.ok(content.includes("Philips Hue"));
  });

  it("creates skill from dev-github template", async () => {
    const result = await createFromTemplate("dev-github", { outputDir: tempDir });
    assert.ok(result.includes("Created skill"));
    assert.ok(result.includes("GitHub Workflow Automation"));

    const filePath = join(tempDir, "github-workflow.md");
    const content = await readFile(filePath, "utf-8");
    assert.ok(content.includes("name: github-workflow"));
  });

  it("returns error for unknown template", async () => {
    const result = await createFromTemplate("nonexistent", { outputDir: tempDir });
    assert.ok(result.includes("Error:"));
    assert.ok(result.includes("not found"));
    assert.ok(result.includes("Available:"));
  });

  it("created file is parseable as valid SKILL.md", async () => {
    await createFromTemplate("productivity-todoist", { outputDir: tempDir });

    const filePath = join(tempDir, "todoist.md");
    const content = await readFile(filePath, "utf-8");

    // Should parse without errors
    const { parseSkillMd } = await import("./format.js");
    const parsed = parseSkillMd(content);
    assert.equal(parsed.frontmatter.name, "todoist");
    assert.ok(parsed.instructions.includes("Todoist"));
  });
});

describe("skills/marketplace - searchSkillTemplates", () => {
  it("finds templates by query", () => {
    const result = searchSkillTemplates("spotify");
    assert.ok(result.includes("media-spotify"));
  });

  it("returns no-match message for unknown query", () => {
    const result = searchSkillTemplates("zzz-nonexistent");
    assert.ok(result.includes("No templates found"));
  });

  it("search is case-insensitive", () => {
    const result = searchSkillTemplates("TODOIST");
    assert.ok(result.includes("productivity-todoist"));
  });
});
