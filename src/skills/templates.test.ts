import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getAllTemplates,
  getTemplateById,
  searchTemplates,
  getTemplatesByCategory,
  SKILL_TEMPLATE_CATEGORIES,
} from "./templates.js";
import { parseSkillMd, serializeSkillMd } from "./format.js";

describe("skills/templates - getAllTemplates", () => {
  it("returns all built-in templates", () => {
    const templates = getAllTemplates();
    assert.ok(templates.length >= 5);
  });

  it("returns a new array each time (no reference sharing)", () => {
    const a = getAllTemplates();
    const b = getAllTemplates();
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
  });

  it("every template has required fields", () => {
    for (const t of getAllTemplates()) {
      assert.ok(t.id, `Template missing id`);
      assert.ok(t.name, `Template ${t.id} missing name`);
      assert.ok(t.category, `Template ${t.id} missing category`);
      assert.ok(t.description, `Template ${t.id} missing description`);
      assert.ok(t.frontmatter.name, `Template ${t.id} missing frontmatter.name`);
      assert.ok(t.frontmatter.description, `Template ${t.id} missing frontmatter.description`);
      assert.ok(t.instructions.length > 0, `Template ${t.id} has empty instructions`);
    }
  });

  it("every template category is valid", () => {
    const validCategories = new Set<string>(SKILL_TEMPLATE_CATEGORIES);
    for (const t of getAllTemplates()) {
      assert.ok(validCategories.has(t.category), `Template ${t.id} has invalid category "${t.category}"`);
    }
  });

  it("every template frontmatter is parseable by format.ts", () => {
    for (const t of getAllTemplates()) {
      const content = serializeSkillMd(t.frontmatter, t.instructions);
      const parsed = parseSkillMd(content);
      assert.equal(parsed.frontmatter.name, t.frontmatter.name);
      assert.equal(parsed.frontmatter.description, t.frontmatter.description);
    }
  });
});

describe("skills/templates - getTemplateById", () => {
  it("returns template for known id", () => {
    const t = getTemplateById("smart-home-hue");
    assert.ok(t);
    assert.equal(t.id, "smart-home-hue");
    assert.equal(t.category, "smart-home");
  });

  it("returns template for dev-github", () => {
    const t = getTemplateById("dev-github");
    assert.ok(t);
    assert.equal(t.id, "dev-github");
    assert.equal(t.category, "development");
  });

  it("returns undefined for unknown id", () => {
    const t = getTemplateById("nonexistent-template");
    assert.equal(t, undefined);
  });

  it("returns each known template by its id", () => {
    const knownIds = ["smart-home-hue", "smart-home-ha", "productivity-todoist", "media-spotify", "dev-github"];
    for (const id of knownIds) {
      const t = getTemplateById(id);
      assert.ok(t, `Template "${id}" should exist`);
      assert.equal(t.id, id);
    }
  });
});

describe("skills/templates - searchTemplates", () => {
  it("finds templates matching name", () => {
    const results = searchTemplates("hue");
    assert.ok(results.length >= 1);
    assert.ok(results.some((t) => t.id === "smart-home-hue"));
  });

  it("finds templates matching category", () => {
    const results = searchTemplates("smart-home");
    assert.ok(results.length >= 2);
  });

  it("finds templates matching description", () => {
    const results = searchTemplates("playback");
    assert.ok(results.length >= 1);
    assert.ok(results.some((t) => t.id === "media-spotify"));
  });

  it("search is case-insensitive", () => {
    const results = searchTemplates("GITHUB");
    assert.ok(results.length >= 1);
    assert.ok(results.some((t) => t.id === "dev-github"));
  });

  it("returns empty array for no matches", () => {
    const results = searchTemplates("zzz-nonexistent-zzz");
    assert.equal(results.length, 0);
  });

  it("matches against template id", () => {
    const results = searchTemplates("productivity-todoist");
    assert.ok(results.length >= 1);
    assert.ok(results.some((t) => t.id === "productivity-todoist"));
  });
});

describe("skills/templates - getTemplatesByCategory", () => {
  it("returns smart-home templates", () => {
    const results = getTemplatesByCategory("smart-home");
    assert.ok(results.length >= 2);
    for (const t of results) {
      assert.equal(t.category, "smart-home");
    }
  });

  it("returns development templates", () => {
    const results = getTemplatesByCategory("development");
    assert.ok(results.length >= 1);
    for (const t of results) {
      assert.equal(t.category, "development");
    }
  });

  it("returns empty for unknown category", () => {
    const results = getTemplatesByCategory("nonexistent");
    assert.equal(results.length, 0);
  });

  it("returns productivity templates", () => {
    const results = getTemplatesByCategory("productivity");
    assert.ok(results.length >= 1);
    for (const t of results) {
      assert.equal(t.category, "productivity");
    }
  });
});

describe("skills/templates - SKILL_TEMPLATE_CATEGORIES", () => {
  it("contains expected categories", () => {
    assert.ok(SKILL_TEMPLATE_CATEGORIES.includes("smart-home"));
    assert.ok(SKILL_TEMPLATE_CATEGORIES.includes("productivity"));
    assert.ok(SKILL_TEMPLATE_CATEGORIES.includes("media"));
    assert.ok(SKILL_TEMPLATE_CATEGORIES.includes("development"));
    assert.ok(SKILL_TEMPLATE_CATEGORIES.includes("communication"));
    assert.ok(SKILL_TEMPLATE_CATEGORIES.includes("utilities"));
  });

  it("has exactly 6 categories", () => {
    assert.equal(SKILL_TEMPLATE_CATEGORIES.length, 6);
  });
});
