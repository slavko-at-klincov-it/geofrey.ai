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
  const template = locales[currentLocale]?.[key] ?? locales.de[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}
