// Lightweight i18n: Polish by default, English switchable per device via a
// cookie — no locale prefixes in URLs, no extra dependencies. Client-safe.

import { MessageKey, messages } from "./messages";

export type Locale = "pl" | "en";

export const LOCALES: Locale[] = ["pl", "en"];
export const DEFAULT_LOCALE: Locale = "pl";
export const LOCALE_COOKIE = "locale";

export type TranslateParams = Record<string, string | number>;
export type Translator = (key: MessageKey, params?: TranslateParams) => string;

export function isLocale(value: unknown): value is Locale {
  return value === "pl" || value === "en";
}

function formatTemplate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/** Plural category for a count: pl → one/few/many, en → one/other. */
function pluralCategory(locale: Locale, n: number): string {
  if (locale === "pl") {
    if (n === 1) return "one";
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "few";
    return "many";
  }
  return n === 1 ? "one" : "other";
}

export function makeT(locale: Locale): Translator {
  const dict = messages[locale] as Record<string, string>;
  const fallback = messages.en as Record<string, string>;
  return (key, params) => {
    const template = dict[key] ?? fallback[key] ?? key;
    return formatTemplate(template, params);
  };
}

/**
 * Plural-aware lookup: resolves `${base}.${category}` with sensible
 * fallbacks (pl few/many → many → one; en other → one).
 */
export function makeTPlural(locale: Locale) {
  const dict = messages[locale] as Record<string, string>;
  const fallback = messages.en as Record<string, string>;
  return (base: string, count: number, params?: TranslateParams): string => {
    const category = pluralCategory(locale, count);
    const template =
      dict[`${base}.${category}`] ??
      dict[`${base}.many`] ??
      dict[`${base}.other`] ??
      dict[`${base}.one`] ??
      fallback[`${base}.other`] ??
      fallback[`${base}.one`] ??
      base;
    return formatTemplate(template, { count, ...params });
  };
}

/** Localized message for an API error code, or null when we have none. */
export function apiErrorMessage(
  locale: Locale,
  code: string | undefined | null,
  params?: TranslateParams
): string | null {
  if (!code) return null;
  const dict = messages[locale] as Record<string, string>;
  const template = dict[`err.${code}`];
  return template ? formatTemplate(template, params) : null;
}

export type { MessageKey };
