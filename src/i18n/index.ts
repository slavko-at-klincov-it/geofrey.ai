import { de } from "./locales/de.js";
import { en } from "./locales/en.js";
import type { TranslationKey } from "./keys.js";

export type Locale = "de" | "en";
export type { TranslationKey };

const locales: Record<Locale, Record<TranslationKey, string>> = { de, en };
let currentLocale: Locale = "de";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let template = locales[currentLocale]?.[key];
  if (!template) {
    if (currentLocale !== "de") {
      console.warn(`i18n: missing key "${key}" for locale "${currentLocale}", falling back to de`);
    }
    template = locales.de[key] ?? key;
  }
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}
