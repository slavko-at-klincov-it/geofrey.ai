import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { profileSchema } from "./schema.js";

describe("profile/schema", () => {
  it("parses a valid minimal profile (version + name only)", () => {
    const result = profileSchema.parse({ version: 1, name: "Slavko" });
    assert.equal(result.version, 1);
    assert.equal(result.name, "Slavko");
    assert.equal(result.communicationStyle, "mixed");
    assert.deepEqual(result.interests, []);
    assert.deepEqual(result.calendarApp, { provider: "none" });
    assert.deepEqual(result.notesApp, { provider: "none" });
    assert.deepEqual(result.taskApp, { provider: "none" });
  });

  it("parses a valid full profile with all fields", () => {
    const full = {
      version: 1 as const,
      name: "Slavko",
      timezone: "Europe/Berlin",
      workDirectory: "/Users/slavko/Code",
      communicationStyle: "casual" as const,
      interests: ["TypeScript", "privacy", "home automation"],
      calendarApp: { provider: "google" as const, calendarId: "work" },
      notesApp: { provider: "obsidian" as const, vaultPath: "/vault" },
      taskApp: { provider: "todoist" as const, apiKey: "abc123" },
      morningBrief: {
        enabled: true,
        time: "06:30",
        includeCalendar: true,
        includeEmail: false,
        includeMemory: true,
      },
      calendarWatch: {
        enabled: true,
        intervalMinutes: 5,
        reminderMinutesBefore: 15,
      },
      emailMonitor: {
        enabled: true,
        intervalMinutes: 10,
        vipSenders: ["boss@example.com"],
        keywords: ["urgent"],
      },
    };

    const result = profileSchema.parse(full);
    assert.equal(result.name, "Slavko");
    assert.equal(result.timezone, "Europe/Berlin");
    assert.equal(result.workDirectory, "/Users/slavko/Code");
    assert.equal(result.communicationStyle, "casual");
    assert.deepEqual(result.interests, ["TypeScript", "privacy", "home automation"]);
    assert.equal(result.calendarApp.provider, "google");
    assert.equal(result.notesApp.provider, "obsidian");
    assert.equal(result.taskApp.provider, "todoist");
    assert.equal(result.morningBrief.enabled, true);
    assert.equal(result.morningBrief.time, "06:30");
    assert.equal(result.calendarWatch.enabled, true);
    assert.equal(result.calendarWatch.intervalMinutes, 5);
    assert.equal(result.emailMonitor.enabled, true);
    assert.deepEqual(result.emailMonitor.vipSenders, ["boss@example.com"]);
  });

  it("throws when name is missing", () => {
    assert.throws(() => profileSchema.parse({ version: 1 }), {
      name: "ZodError",
    });
  });

  it("throws when name is empty string", () => {
    assert.throws(() => profileSchema.parse({ version: 1, name: "" }), {
      name: "ZodError",
    });
  });

  it("still parses with an arbitrary timezone string (Zod does not validate tz)", () => {
    const result = profileSchema.parse({
      version: 1,
      name: "Test",
      timezone: "Not/A/Real/Timezone",
    });
    assert.equal(result.timezone, "Not/A/Real/Timezone");
  });

  it("applies default values correctly", () => {
    const result = profileSchema.parse({ version: 1, name: "Test" });
    assert.equal(typeof result.timezone, "string");
    assert.ok(result.timezone.length > 0, "timezone should be non-empty");
    assert.equal(result.communicationStyle, "mixed");
    assert.equal(result.morningBrief.enabled, false);
    assert.equal(result.morningBrief.time, "07:00");
    assert.equal(result.morningBrief.includeCalendar, true);
    assert.equal(result.morningBrief.includeEmail, true);
    assert.equal(result.morningBrief.includeMemory, true);
    assert.equal(result.calendarWatch.enabled, false);
    assert.equal(result.calendarWatch.intervalMinutes, 15);
    assert.equal(result.calendarWatch.reminderMinutesBefore, 10);
    assert.equal(result.emailMonitor.enabled, false);
    assert.equal(result.emailMonitor.intervalMinutes, 15);
    assert.deepEqual(result.emailMonitor.vipSenders, []);
    assert.deepEqual(result.emailMonitor.keywords, []);
  });

  it("calendarApp: google gets default calendarId", () => {
    const result = profileSchema.parse({
      version: 1,
      name: "Test",
      calendarApp: { provider: "google" },
    });
    assert.equal(result.calendarApp.provider, "google");
    assert.equal(
      (result.calendarApp as { provider: "google"; calendarId: string }).calendarId,
      "primary",
    );
  });

  it("calendarApp: caldav requires url", () => {
    assert.throws(
      () =>
        profileSchema.parse({
          version: 1,
          name: "Test",
          calendarApp: { provider: "caldav" },
        }),
      { name: "ZodError" },
    );
  });

  it("calendarApp: caldav rejects invalid url", () => {
    assert.throws(
      () =>
        profileSchema.parse({
          version: 1,
          name: "Test",
          calendarApp: { provider: "caldav", url: "not-a-url" },
        }),
      { name: "ZodError" },
    );
  });

  it("calendarApp: caldav accepts valid url", () => {
    const result = profileSchema.parse({
      version: 1,
      name: "Test",
      calendarApp: { provider: "caldav", url: "https://cal.example.com/dav" },
    });
    assert.equal(result.calendarApp.provider, "caldav");
    assert.equal(
      (result.calendarApp as { provider: "caldav"; url: string }).url,
      "https://cal.example.com/dav",
    );
  });

  it("throws when version is not 1", () => {
    assert.throws(
      () => profileSchema.parse({ version: 2, name: "Test" }),
      { name: "ZodError" },
    );
  });

  it("throws when version is 0", () => {
    assert.throws(
      () => profileSchema.parse({ version: 0, name: "Test" }),
      { name: "ZodError" },
    );
  });
});
