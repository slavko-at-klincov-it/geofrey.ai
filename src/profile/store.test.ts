import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadProfile,
  saveProfile,
  getCachedProfile,
  setProfileBaseDir,
} from "./store.js";
import type { Profile } from "./schema.js";

let tempDir: string;

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

describe("profile/store", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "profile-store-"));
    setProfileBaseDir(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loadProfile returns null when no file exists", async () => {
    const result = await loadProfile();
    assert.equal(result, null);
  });

  it("saveProfile + loadProfile roundtrip", async () => {
    await saveProfile(minimalProfile);
    // Reset cache to force file read
    setProfileBaseDir(tempDir);
    const loaded = await loadProfile();
    assert.notEqual(loaded, null);
    assert.equal(loaded!.name, "Slavko");
    assert.equal(loaded!.timezone, "Europe/Berlin");
    assert.equal(loaded!.communicationStyle, "mixed");
    assert.deepEqual(loaded!.interests, []);
    assert.equal(loaded!.calendarApp.provider, "none");
  });

  it("saveProfile creates .geofrey directory", async () => {
    await saveProfile(minimalProfile);
    const entries = await readdir(tempDir);
    assert.ok(entries.includes(".geofrey"), ".geofrey directory should exist");
    const innerEntries = await readdir(join(tempDir, ".geofrey"));
    assert.ok(innerEntries.includes("profile.json"), "profile.json should exist");
  });

  it("getCachedProfile returns cached value after load", async () => {
    await saveProfile(minimalProfile);
    // Reset cache, then load to populate it
    setProfileBaseDir(tempDir);
    assert.equal(getCachedProfile(), null);
    await loadProfile();
    const cached = getCachedProfile();
    assert.notEqual(cached, null);
    assert.equal(cached!.name, "Slavko");
  });

  it("setProfileBaseDir resets cache", async () => {
    await saveProfile(minimalProfile);
    assert.notEqual(getCachedProfile(), null);
    setProfileBaseDir(tempDir);
    assert.equal(getCachedProfile(), null);
  });

  it("saveProfile validates and rejects invalid data", async () => {
    const invalid = { version: 1 } as unknown as Profile;
    await assert.rejects(() => saveProfile(invalid), {
      name: "ZodError",
    });
  });

  it("saveProfile validates and rejects wrong version", async () => {
    const invalid = { version: 2, name: "Test" } as unknown as Profile;
    await assert.rejects(() => saveProfile(invalid), {
      name: "ZodError",
    });
  });

  it("loadProfile returns cached value on second call", async () => {
    await saveProfile(minimalProfile);
    // Reset to force file read on first call
    setProfileBaseDir(tempDir);
    const first = await loadProfile();
    const second = await loadProfile();
    assert.equal(first, second, "should return same cached reference");
  });
});
