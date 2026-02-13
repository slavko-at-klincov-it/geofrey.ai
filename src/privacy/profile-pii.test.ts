import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getProfilePiiTerms } from "./profile-pii.js";
import { setProfileBaseDir, saveProfile, getCachedProfile } from "../profile/store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Profile } from "../profile/schema.js";

const baseProfile: Profile = {
  version: 1,
  name: "Slavko Klincov",
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

describe("profile-pii", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "profile-pii-"));
    setProfileBaseDir(tempDir);
  });

  it("returns empty array when no profile is cached", () => {
    // After setProfileBaseDir, cache is cleared
    assert.equal(getCachedProfile(), null);
    const terms = getProfilePiiTerms();
    assert.deepEqual(terms, []);
  });

  it("returns name when profile has name", async () => {
    await saveProfile({ ...baseProfile, name: "Alice" });
    const terms = getProfilePiiTerms();
    assert.ok(terms.includes("Alice"));
  });

  it("splits name into parts", async () => {
    await saveProfile(baseProfile);
    const terms = getProfilePiiTerms();
    assert.ok(terms.includes("Slavko Klincov"), "should include full name");
    assert.ok(terms.includes("Slavko"), "should include first name");
    assert.ok(terms.includes("Klincov"), "should include last name");
  });

  it("returns VIP senders", async () => {
    await saveProfile({
      ...baseProfile,
      emailMonitor: {
        ...baseProfile.emailMonitor,
        vipSenders: ["boss@acme.com", "partner@corp.de"],
      },
    });
    const terms = getProfilePiiTerms();
    assert.ok(terms.includes("boss@acme.com"));
    assert.ok(terms.includes("partner@corp.de"));
  });

  it("deduplicates name parts", async () => {
    // Single-word name: full name === the one part
    await saveProfile({ ...baseProfile, name: "Alice" });
    const terms = getProfilePiiTerms();
    // "Alice" should appear only once (full name and single part are same)
    const count = terms.filter((t) => t === "Alice").length;
    assert.equal(count, 1, "should not duplicate single-word name");
  });

  it("filters short name parts (< 2 chars)", async () => {
    await saveProfile({ ...baseProfile, name: "A B Charlie" });
    const terms = getProfilePiiTerms();
    assert.ok(!terms.includes("A"), "should filter single-char parts");
    assert.ok(!terms.includes("B"), "should filter single-char parts");
    assert.ok(terms.includes("Charlie"), "should keep longer parts");
  });

  it("combines name and VIP senders", async () => {
    await saveProfile({
      ...baseProfile,
      name: "Max Mustermann",
      emailMonitor: {
        ...baseProfile.emailMonitor,
        vipSenders: ["ceo@firma.de"],
      },
    });
    const terms = getProfilePiiTerms();
    assert.ok(terms.includes("Max Mustermann"));
    assert.ok(terms.includes("Max"));
    assert.ok(terms.includes("Mustermann"));
    assert.ok(terms.includes("ceo@firma.de"));
    assert.equal(terms.length, 4);
  });
});
