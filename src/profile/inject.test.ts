import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProfileContext } from "./inject.js";
import type { Profile } from "./schema.js";

const minimalProfile: Profile = {
  version: 1,
  name: "Slavko",
  timezone: "Europe/Berlin",
  communicationStyle: "mixed",
  interests: [],
  calendarApp: { provider: "none" },
  notesApp: { provider: "none" },
  taskApp: { provider: "none" },
  morningBrief: {
    enabled: false,
    time: "07:00",
    includeCalendar: true,
    includeEmail: true,
    includeMemory: true,
  },
  calendarWatch: {
    enabled: false,
    intervalMinutes: 15,
    reminderMinutesBefore: 10,
  },
  emailMonitor: {
    enabled: false,
    intervalMinutes: 15,
    vipSenders: [],
    keywords: [],
  },
};

describe("profile/inject - buildProfileContext", () => {
  it("minimal profile contains name, timezone, and communication style", () => {
    const output = buildProfileContext(minimalProfile);
    assert.ok(output.includes("<user_profile>"));
    assert.ok(output.includes("</user_profile>"));
    assert.ok(output.includes("<name>Slavko</name>"));
    assert.ok(output.includes("<timezone>Europe/Berlin</timezone>"));
    assert.ok(output.includes("<communication_style>mixed</communication_style>"));
    assert.ok(output.includes("<calendar_provider>none</calendar_provider>"));
    assert.ok(output.includes("<notes_provider>none</notes_provider>"));
    assert.ok(output.includes("<task_provider>none</task_provider>"));
  });

  it("full profile contains all fields including interests", () => {
    const full: Profile = {
      ...minimalProfile,
      workDirectory: "/Users/slavko/Code",
      interests: ["TypeScript", "privacy", "home automation"],
      calendarApp: { provider: "google", calendarId: "primary" },
      notesApp: { provider: "obsidian", vaultPath: "/vault" },
      taskApp: { provider: "todoist", apiKey: "abc123" },
      morningBrief: {
        ...minimalProfile.morningBrief,
        enabled: true,
        time: "06:30",
      },
    };

    const output = buildProfileContext(full);
    assert.ok(output.includes("<name>Slavko</name>"));
    assert.ok(output.includes("<work_directory>/Users/slavko/Code</work_directory>"));
    assert.ok(output.includes("<interests>TypeScript, privacy, home automation</interests>"));
    assert.ok(output.includes("<calendar_provider>google</calendar_provider>"));
    assert.ok(output.includes("<notes_provider>obsidian</notes_provider>"));
    assert.ok(output.includes("<task_provider>todoist</task_provider>"));
    assert.ok(output.includes('<morning_brief time="06:30" />'));
  });

  it("omits workDirectory when not set", () => {
    const output = buildProfileContext(minimalProfile);
    assert.ok(!output.includes("<work_directory>"), "should not contain work_directory");
  });

  it("omits workDirectory when undefined", () => {
    const profile: Profile = { ...minimalProfile, workDirectory: undefined };
    const output = buildProfileContext(profile);
    assert.ok(!output.includes("<work_directory>"), "should not contain work_directory");
  });

  it("shows morning brief when enabled", () => {
    const profile: Profile = {
      ...minimalProfile,
      morningBrief: {
        ...minimalProfile.morningBrief,
        enabled: true,
        time: "08:00",
      },
    };
    const output = buildProfileContext(profile);
    assert.ok(output.includes('<morning_brief time="08:00" />'));
  });

  it("hides morning brief when disabled", () => {
    const output = buildProfileContext(minimalProfile);
    assert.ok(!output.includes("<morning_brief"), "should not contain morning_brief");
  });

  it("joins interests with comma and space", () => {
    const profile: Profile = {
      ...minimalProfile,
      interests: ["AI", "music"],
    };
    const output = buildProfileContext(profile);
    assert.ok(output.includes("<interests>AI, music</interests>"));
  });

  it("omits interests tag when array is empty", () => {
    const output = buildProfileContext(minimalProfile);
    assert.ok(!output.includes("<interests>"), "should not contain interests tag");
  });
});
