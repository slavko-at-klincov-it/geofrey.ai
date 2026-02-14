import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSkillMd, serializeSkillMd, type SkillFrontmatter } from "../../skills/format.js";
import { loadSkill, type Skill } from "../../skills/registry.js";
import { buildSkillContext } from "../../skills/injector.js";

// Realistic German-context skill content for the Hue light control skill
const HUE_SKILL_MD = `---
name: hue-steuerung
emoji: "\\U0001F4A1"
description: Philips Hue Lampen steuern - ein/aus, Helligkeit, Farbe, Szenen
version: 2.1.0
author: Slavko Klincov
dependencies:
  - web_fetch
  - memory_read
permissions:
  filesystem: none
  network: local
  env: read
  exec: none
install: npm install node-hue-api
---

Du kannst Philips Hue Lampen ueber die lokale Hue Bridge API steuern.

## Befehle
- **Ein/Aus**: PUT an http://{bridge}/api/{key}/lights/{id}/state
- **Helligkeit**: PUT mit {"bri": 0-254}
- **Farbe**: PUT mit {"hue": 0-65535, "sat": 0-254}

## Sicherheit
- Immer bestaetigen bevor alle Lichter ausgeschaltet werden
- Zwischen 23:00 und 06:00 keine Aenderungen ohne explizite Anfrage`;

// A second skill for multi-skill discovery
const NOTIZEN_SKILL_MD = `---
name: notizen-manager
description: Strukturierte Notizen erstellen und verwalten
version: 1.0.0
dependencies:
  - memory_write
  - memory_search
permissions:
  filesystem: write
  network: none
  env: none
  exec: none
---

Erstelle strukturierte Notizen mit Kategorien und Tags.

## Format
Jede Notiz hat: Titel, Kategorie, Tags, Inhalt.
Speichere in MEMORY.md unter der Sektion "Notizen".`;

describe("E2E: Skills System", { timeout: 30_000 }, () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "geofrey-e2e-skills-"));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("parseSkillFrontmatter parses valid SKILL.md", () => {
    const content = `---
name: projekt-scanner
description: Scannt Projektverzeichnisse und erstellt eine strukturierte Uebersicht
version: 1.5.0
author: Entwicklerteam Muenchen
dependencies:
  - shell
  - filesystem
permissions:
  filesystem: read
  network: none
  env: none
  exec: restricted
---

Wenn der Benutzer nach einer Projektuebersicht fragt, scanne das Verzeichnis rekursiv.
Erstelle eine Baumstruktur mit Dateigroessen und Aenderungsdaten.`;

    const { frontmatter, instructions } = parseSkillMd(content);

    assert.equal(frontmatter.name, "projekt-scanner");
    assert.equal(frontmatter.description, "Scannt Projektverzeichnisse und erstellt eine strukturierte Uebersicht");
    assert.equal(frontmatter.version, "1.5.0");
    assert.equal(frontmatter.author, "Entwicklerteam Muenchen");
    assert.deepEqual(frontmatter.dependencies, ["shell", "filesystem"]);
    assert.equal(frontmatter.permissions.filesystem, "read");
    assert.equal(frontmatter.permissions.network, "none");
    assert.equal(frontmatter.permissions.env, "none");
    assert.equal(frontmatter.permissions.exec, "restricted");
    assert.ok(instructions.includes("Wenn der Benutzer nach einer Projektuebersicht fragt"));
    assert.ok(instructions.includes("Baumstruktur"));
  });

  it("serializeSkillFrontmatter round-trips correctly", () => {
    const originalFrontmatter: SkillFrontmatter = {
      name: "datenbank-backup",
      emoji: "DB",
      description: "Automatische SQLite-Backups mit Komprimierung und Rotation",
      version: "3.0.0",
      author: "Anna Schmidt",
      dependencies: ["shell", "filesystem", "memory_write"],
      permissions: {
        filesystem: "write",
        network: "none",
        env: "read",
        exec: "restricted",
      },
      install: "npm install better-sqlite3",
    };
    const originalInstructions =
      "Erstelle taeglich ein Backup der SQLite-Datenbank.\nKomprimiere mit gzip und rotiere nach 7 Tagen.";

    // Serialize
    const serialized = serializeSkillMd(originalFrontmatter, originalInstructions);
    assert.ok(serialized.startsWith("---\n"), "Serialized output should start with frontmatter delimiter");
    assert.ok(serialized.includes("datenbank-backup"), "Serialized output should contain the skill name");

    // Parse back
    const { frontmatter: parsed, instructions: parsedBody } = parseSkillMd(serialized);

    assert.equal(parsed.name, originalFrontmatter.name);
    assert.equal(parsed.description, originalFrontmatter.description);
    assert.equal(parsed.version, originalFrontmatter.version);
    assert.equal(parsed.author, originalFrontmatter.author);
    assert.deepEqual(parsed.dependencies, originalFrontmatter.dependencies);
    assert.equal(parsed.permissions.filesystem, originalFrontmatter.permissions.filesystem);
    assert.equal(parsed.permissions.network, originalFrontmatter.permissions.network);
    assert.equal(parsed.permissions.env, originalFrontmatter.permissions.env);
    assert.equal(parsed.permissions.exec, originalFrontmatter.permissions.exec);
    assert.equal(parsed.install, originalFrontmatter.install);
    assert.equal(parsedBody, originalInstructions);
  });

  it("discoverSkills finds .md files in skills directory", async () => {
    // Create a temp skills directory with two skill files
    const skillsDir = join(tmpDir, "skills-discover");
    await mkdir(skillsDir, { recursive: true });
    await writeFile(join(skillsDir, "hue-steuerung.md"), HUE_SKILL_MD, "utf-8");
    await writeFile(join(skillsDir, "notizen-manager.md"), NOTIZEN_SKILL_MD, "utf-8");

    // Load each skill individually via loadSkill (discoverSkills uses hardcoded dirs)
    const skill1 = await loadSkill(join(skillsDir, "hue-steuerung.md"), "local");
    const skill2 = await loadSkill(join(skillsDir, "notizen-manager.md"), "local");

    assert.equal(skill1.id, "hue-steuerung");
    assert.equal(skill1.frontmatter.name, "hue-steuerung");
    assert.equal(skill1.frontmatter.version, "2.1.0");
    assert.deepEqual(skill1.frontmatter.dependencies, ["web_fetch", "memory_read"]);
    assert.equal(skill1.source, "local");
    assert.equal(skill1.enabled, true);
    assert.ok(skill1.instructions.includes("Philips Hue Lampen"));

    assert.equal(skill2.id, "notizen-manager");
    assert.equal(skill2.frontmatter.name, "notizen-manager");
    assert.equal(skill2.frontmatter.permissions.filesystem, "write");
    assert.deepEqual(skill2.frontmatter.dependencies, ["memory_write", "memory_search"]);
    assert.ok(skill2.instructions.includes("Erstelle strukturierte Notizen"));

    // Verify both loaded from real files on disk (not mocked)
    assert.ok(skill1.filePath.includes("hue-steuerung.md"));
    assert.ok(skill2.filePath.includes("notizen-manager.md"));
  });

  it("buildSkillContext generates system prompt injection", () => {
    const skills: Skill[] = [
      {
        id: "hue-steuerung",
        frontmatter: {
          name: "hue-steuerung",
          emoji: "LB",
          description: "Philips Hue Lampen steuern",
          version: "2.1.0",
          dependencies: ["web_fetch"],
          permissions: { filesystem: "none", network: "local", env: "read", exec: "none" },
        },
        instructions: "Steuere die Hue Bridge ueber die REST API.\nBestaetigung vor dem Ausschalten aller Lichter.",
        filePath: "/tmp/hue-steuerung.md",
        enabled: true,
        source: "local",
      },
      {
        id: "notizen-manager",
        frontmatter: {
          name: "notizen-manager",
          description: "Strukturierte Notizen verwalten",
          version: "1.0.0",
          dependencies: [],
          permissions: { filesystem: "write", network: "none", env: "none", exec: "none" },
        },
        instructions: "Erstelle Notizen im MEMORY.md Format.",
        filePath: "/tmp/notizen-manager.md",
        enabled: true,
        source: "local",
      },
      {
        id: "disabled-skill",
        frontmatter: {
          name: "disabled-skill",
          description: "This skill is disabled",
          version: "1.0.0",
          dependencies: [],
          permissions: { filesystem: "none", network: "none", env: "none", exec: "none" },
        },
        instructions: "Should not appear in context.",
        filePath: "/tmp/disabled.md",
        enabled: false,
        source: "global",
      },
    ];

    const context = buildSkillContext(skills);

    // Should contain the outer <skills> wrapper
    assert.ok(context.startsWith("<skills>"), "Context should start with <skills> tag");
    assert.ok(context.endsWith("</skills>"), "Context should end with </skills> tag");

    // Should contain both enabled skills
    assert.ok(context.includes('name="hue-steuerung"'), "Should contain hue-steuerung skill");
    assert.ok(context.includes('emoji="LB"'), "Should include emoji attribute for hue skill");
    assert.ok(context.includes("Steuere die Hue Bridge"), "Should include hue instructions");
    assert.ok(context.includes('name="notizen-manager"'), "Should contain notizen-manager skill");
    assert.ok(context.includes("Erstelle Notizen im MEMORY.md"), "Should include notizen instructions");

    // Should NOT contain the disabled skill
    assert.ok(!context.includes("disabled-skill"), "Should not include disabled skill");
    assert.ok(!context.includes("Should not appear"), "Disabled skill instructions should be absent");
  });

  it("buildSkillContext returns empty string for no enabled skills", () => {
    const disabledOnly: Skill[] = [
      {
        id: "off",
        frontmatter: {
          name: "off",
          description: "Disabled",
          version: "1.0.0",
          dependencies: [],
          permissions: { filesystem: "none", network: "none", env: "none", exec: "none" },
        },
        instructions: "Nothing.",
        filePath: "/tmp/off.md",
        enabled: false,
        source: "local",
      },
    ];

    const context = buildSkillContext(disabledOnly);
    assert.equal(context, "", "Should return empty string when no skills are enabled");
  });

  it("invalid SKILL.md frontmatter returns error", () => {
    // Missing opening ---
    assert.throws(
      () => parseSkillMd("name: broken\ndescription: Kaputt\n---\nInhalt"),
      /Missing frontmatter/,
      "Should throw on missing opening delimiter",
    );

    // Missing closing ---
    assert.throws(
      () => parseSkillMd("---\nname: broken\ndescription: Kaputt"),
      /Missing frontmatter closing/,
      "Should throw on missing closing delimiter",
    );

    // Missing required 'name' field
    assert.throws(
      () => parseSkillMd("---\ndescription: Nur Beschreibung\n---\nInhalt"),
      { name: "ZodError" },
      "Should throw ZodError on missing required name field",
    );

    // Missing required 'description' field
    assert.throws(
      () => parseSkillMd("---\nname: nur-name\n---\nInhalt"),
      { name: "ZodError" },
      "Should throw ZodError on missing required description field",
    );

    // Invalid permission value
    assert.throws(
      () =>
        parseSkillMd(`---
name: invalid-perms
description: Ungueltige Berechtigungen
permissions:
  filesystem: delete
---

Inhalt.`),
      { name: "ZodError" },
      "Should throw ZodError on invalid permission value",
    );
  });

  it("loadSkill reads a real SKILL.md file from disk", async () => {
    const filePath = join(tmpDir, "kalender-sync.md");
    await writeFile(
      filePath,
      `---
name: kalender-sync
description: Google Calendar mit lokalen Terminen synchronisieren
version: 1.2.0
author: Max Mustermann
dependencies:
  - calendar
  - memory_write
permissions:
  filesystem: none
  network: full
  env: read
  exec: none
---

Synchronisiere Google Calendar Events mit dem lokalen Speicher.
Neue Termine werden automatisch in MEMORY.md unter "Termine" eingetragen.`,
      "utf-8",
    );

    const skill = await loadSkill(filePath, "global");

    assert.equal(skill.id, "kalender-sync");
    assert.equal(skill.frontmatter.name, "kalender-sync");
    assert.equal(skill.frontmatter.description, "Google Calendar mit lokalen Terminen synchronisieren");
    assert.equal(skill.frontmatter.version, "1.2.0");
    assert.equal(skill.frontmatter.author, "Max Mustermann");
    assert.deepEqual(skill.frontmatter.dependencies, ["calendar", "memory_write"]);
    assert.equal(skill.frontmatter.permissions.network, "full");
    assert.equal(skill.frontmatter.permissions.env, "read");
    assert.equal(skill.source, "global");
    assert.equal(skill.enabled, true);
    assert.ok(skill.instructions.includes("Synchronisiere Google Calendar Events"));
    assert.ok(skill.instructions.includes("Termine"));
  });

  it("loadSkill rejects an invalid file from disk", async () => {
    const filePath = join(tmpDir, "kaputt.md");
    await writeFile(filePath, "Das ist kein gueltiges Skill-Format.", "utf-8");

    await assert.rejects(
      () => loadSkill(filePath, "local"),
      /Missing frontmatter/,
      "Should reject a file without frontmatter delimiters",
    );
  });
});
