import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { t, setLocale, getLocale } from "./index.js";
import { de } from "./locales/de.js";
import { en } from "./locales/en.js";
import type { TranslationKey } from "./keys.js";

describe("i18n", () => {
  beforeEach(() => {
    setLocale("de");
  });

  it("returns German by default", () => {
    assert.equal(t("approval.blockedCommand"), "Gesperrter Befehl");
  });

  it("returns English after setLocale('en')", () => {
    setLocale("en");
    assert.equal(t("approval.blockedCommand"), "Blocked command");
  });

  it("interpolates {param} correctly", () => {
    assert.equal(t("tools.l3Blocked", { reason: "test" }), "L3: Aktion blockiert — test");
  });

  it("interpolates multiple params", () => {
    assert.equal(
      t("tools.executionFailed", { name: "shell_exec", msg: "timeout" }),
      "ERROR: shell_exec fehlgeschlagen — timeout",
    );
  });

  it("returns key as fallback for unknown keys", () => {
    // Force cast to test fallback behavior
    assert.equal(t("nonexistent.key" as TranslationKey), "nonexistent.key");
  });

  it("getLocale returns current locale", () => {
    assert.equal(getLocale(), "de");
    setLocale("en");
    assert.equal(getLocale(), "en");
  });

  it("preserves unmatched params in template", () => {
    assert.equal(t("tools.l3Blocked", {}), "L3: Aktion blockiert — {reason}");
  });

  it("all keys present in both locales", () => {
    const deKeys = Object.keys(de) as TranslationKey[];
    const enKeys = Object.keys(en) as TranslationKey[];

    const missingInEn = deKeys.filter((k) => !enKeys.includes(k));
    const missingInDe = enKeys.filter((k) => !deKeys.includes(k));

    assert.deepEqual(missingInEn, [], `Keys missing in en: ${missingInEn.join(", ")}`);
    assert.deepEqual(missingInDe, [], `Keys missing in de: ${missingInDe.join(", ")}`);
  });

  it("no empty string values in either locale", () => {
    for (const [key, value] of Object.entries(de)) {
      assert.ok(value.length > 0, `de.${key} is empty`);
    }
    for (const [key, value] of Object.entries(en)) {
      assert.ok(value.length > 0, `en.${key} is empty`);
    }
  });
});
