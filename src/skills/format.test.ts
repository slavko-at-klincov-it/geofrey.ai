import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSkillMd, serializeSkillMd, skillFrontmatterSchema } from "./format.js";

describe("skills/format - parseSkillMd", () => {
  it("parses valid SKILL.md with full frontmatter", () => {
    const content = `---
name: web-scraper
emoji: "\uD83D\uDD77\uFE0F"
description: Scrape web pages and extract structured data
version: 2.0.0
author: Test Author
dependencies:
  - web_fetch
  - shell
permissions:
  filesystem: write
  network: full
  env: read
  exec: restricted
install: npm install cheerio
---

When the user asks to scrape a website, use the web_fetch tool first.
Then parse the HTML and extract the requested data.`;

    const { frontmatter, instructions } = parseSkillMd(content);
    assert.equal(frontmatter.name, "web-scraper");
    assert.equal(frontmatter.emoji, "\uD83D\uDD77\uFE0F");
    assert.equal(frontmatter.description, "Scrape web pages and extract structured data");
    assert.equal(frontmatter.version, "2.0.0");
    assert.equal(frontmatter.author, "Test Author");
    assert.deepEqual(frontmatter.dependencies, ["web_fetch", "shell"]);
    assert.equal(frontmatter.permissions.filesystem, "write");
    assert.equal(frontmatter.permissions.network, "full");
    assert.equal(frontmatter.permissions.env, "read");
    assert.equal(frontmatter.permissions.exec, "restricted");
    assert.equal(frontmatter.install, "npm install cheerio");
    assert.ok(instructions.includes("When the user asks to scrape a website"));
  });

  it("parses minimal frontmatter with defaults", () => {
    const content = `---
name: hello
description: A simple skill
---

Say hello to the user.`;

    const { frontmatter, instructions } = parseSkillMd(content);
    assert.equal(frontmatter.name, "hello");
    assert.equal(frontmatter.description, "A simple skill");
    assert.equal(frontmatter.version, "1.0.0");
    assert.equal(frontmatter.emoji, undefined);
    assert.equal(frontmatter.author, undefined);
    assert.deepEqual(frontmatter.dependencies, []);
    assert.equal(frontmatter.permissions.filesystem, "none");
    assert.equal(frontmatter.permissions.network, "none");
    assert.equal(frontmatter.permissions.env, "none");
    assert.equal(frontmatter.permissions.exec, "none");
    assert.equal(frontmatter.install, undefined);
    assert.equal(instructions, "Say hello to the user.");
  });

  it("throws on missing frontmatter opening ---", () => {
    const content = `name: hello
description: test
---
body`;
    assert.throws(() => parseSkillMd(content), /Missing frontmatter/);
  });

  it("throws on missing frontmatter closing ---", () => {
    const content = `---
name: hello
description: test`;
    assert.throws(() => parseSkillMd(content), /Missing frontmatter closing/);
  });

  it("throws on missing required name field", () => {
    const content = `---
description: A skill without name
---

Instructions here.`;
    assert.throws(() => parseSkillMd(content));
  });

  it("throws on missing required description field", () => {
    const content = `---
name: test-skill
---

Instructions here.`;
    assert.throws(() => parseSkillMd(content));
  });

  it("parses inline arrays", () => {
    const content = `---
name: test
description: Test skill
dependencies: [web_fetch, shell]
---

Instructions.`;

    const { frontmatter } = parseSkillMd(content);
    assert.deepEqual(frontmatter.dependencies, ["web_fetch", "shell"]);
  });

  it("parses empty inline array", () => {
    const content = `---
name: test
description: Test skill
dependencies: []
---

Instructions.`;

    const { frontmatter } = parseSkillMd(content);
    assert.deepEqual(frontmatter.dependencies, []);
  });

  it("handles quoted string values", () => {
    const content = `---
name: "my-skill"
description: 'A skill with: colons and special chars'
---

Instructions.`;

    const { frontmatter } = parseSkillMd(content);
    assert.equal(frontmatter.name, "my-skill");
    assert.equal(frontmatter.description, "A skill with: colons and special chars");
  });

  it("parses empty body", () => {
    const content = `---
name: empty
description: No instructions
---`;

    const { frontmatter, instructions } = parseSkillMd(content);
    assert.equal(frontmatter.name, "empty");
    assert.equal(instructions, "");
  });
});

describe("skills/format - serializeSkillMd", () => {
  it("serializes frontmatter + instructions to SKILL.md format", () => {
    const frontmatter = {
      name: "test-skill",
      description: "A test skill",
      version: "1.0.0",
      dependencies: ["shell"],
      permissions: {
        filesystem: "read" as const,
        network: "none" as const,
        env: "none" as const,
        exec: "none" as const,
      },
    };

    const result = serializeSkillMd(frontmatter, "Do the thing.");
    assert.ok(result.startsWith("---\n"));
    assert.ok(result.includes("name: test-skill"));
    assert.ok(result.includes("description: A test skill"));
    assert.ok(result.includes("version: 1.0.0"));
    assert.ok(result.includes("  - shell"));
    assert.ok(result.includes("filesystem: read"));
    assert.ok(result.includes("Do the thing."));
  });

  it("roundtrip: serialize then parse", () => {
    const original = {
      name: "roundtrip",
      description: "Roundtrip test",
      version: "2.0.0",
      author: "Tester",
      dependencies: ["web_fetch", "memory_read"],
      permissions: {
        filesystem: "write" as const,
        network: "full" as const,
        env: "read" as const,
        exec: "restricted" as const,
      },
    };
    const body = "Step 1: Fetch data.\nStep 2: Save to memory.";

    const serialized = serializeSkillMd(original, body);
    const { frontmatter, instructions } = parseSkillMd(serialized);

    assert.equal(frontmatter.name, original.name);
    assert.equal(frontmatter.description, original.description);
    assert.equal(frontmatter.version, original.version);
    assert.equal(frontmatter.author, original.author);
    assert.deepEqual(frontmatter.dependencies, original.dependencies);
    assert.equal(frontmatter.permissions.filesystem, original.permissions.filesystem);
    assert.equal(frontmatter.permissions.network, original.permissions.network);
    assert.equal(frontmatter.permissions.env, original.permissions.env);
    assert.equal(frontmatter.permissions.exec, original.permissions.exec);
    assert.equal(instructions, body);
  });

  it("omits optional fields when undefined", () => {
    const frontmatter = {
      name: "minimal",
      description: "Minimal skill",
      version: "1.0.0",
      dependencies: [],
      permissions: {
        filesystem: "none" as const,
        network: "none" as const,
        env: "none" as const,
        exec: "none" as const,
      },
    };

    const result = serializeSkillMd(frontmatter, "Minimal.");
    assert.ok(!result.includes("emoji:"));
    assert.ok(!result.includes("author:"));
    assert.ok(!result.includes("install:"));
  });
});

describe("skills/format - skillFrontmatterSchema", () => {
  it("validates valid frontmatter", () => {
    const result = skillFrontmatterSchema.parse({
      name: "test",
      description: "A test",
    });
    assert.equal(result.name, "test");
    assert.equal(result.version, "1.0.0");
    assert.deepEqual(result.dependencies, []);
  });

  it("rejects empty name", () => {
    assert.throws(() =>
      skillFrontmatterSchema.parse({ name: "", description: "A test" }),
    );
  });

  it("rejects empty description", () => {
    assert.throws(() =>
      skillFrontmatterSchema.parse({ name: "test", description: "" }),
    );
  });

  it("rejects invalid permission values", () => {
    assert.throws(() =>
      skillFrontmatterSchema.parse({
        name: "test",
        description: "A test",
        permissions: { filesystem: "delete" },
      }),
    );
  });

  it("applies default permission values", () => {
    const result = skillFrontmatterSchema.parse({
      name: "test",
      description: "A test",
    });
    assert.equal(result.permissions.filesystem, "none");
    assert.equal(result.permissions.network, "none");
    assert.equal(result.permissions.env, "none");
    assert.equal(result.permissions.exec, "none");
  });
});
