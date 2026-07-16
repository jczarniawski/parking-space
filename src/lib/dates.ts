// Calendar-day and business-day logic for the booking window.
//
// All dates in the app are office-local calendar days represented as
// "YYYY-MM-DD" strings (ISODate). "Today" is computed in the office timezone
// (OFFICE_TIMEZONE env, default Europe/Warsaw) so the booking window rolls
// over at office midnight regardless of where the server or user is.
//
// This module is dependency-free and safe to import from both server and
// client code (formatting helpers only use UTC math on the Y-M-D parts, so
// the browser's timezone never shifts the displayed day).

export type ISODate = string; // "YYYY-MM-DD"

/** How many business days ahead of today a spot can be booked. */
export const BOOKING_HORIZON_BUSINESS_DAYS = 2;

/** How many calendar days ahead a management member may release their spot. */
export const RELEASE_HORIZON_DAYS = 60;

export function officeTimeZone(): string {
  // In the browser, process.env.OFFICE_TIMEZONE is never inlined (it isn't
  // NEXT_PUBLIC_-prefixed), so the server-rendered layout exposes the
  // configured zone as an attribute on <html> instead.
  if (typeof document !== "undefined") {
    return (
      document.documentElement.dataset.officeTz ||
      process.env.OFFICE_TIMEZONE ||
      "Europe/Warsaw"
    );
  }
  return process.env.OFFICE_TIMEZONE || "Europe/Warsaw";
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/** Today's calendar date in the office timezone. */
export function todayInOfficeTz(now: Date = new Date()): ISODate {
  // en-CA locale formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: officeTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtcDate(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(dt: Date): ISODate {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: ISODate): number {
  const day = toUtcDate(date).getUTCDay(); // 0 = Sunday … 6 = Saturday
  return day === 0 ? 7 : day;
}

export function isWeekend(date: ISODate): boolean {
  return isoWeekday(date) >= 6;
}

export function addDays(date: ISODate, days: number): ISODate {
  const dt = toUtcDate(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtcDate(dt);
}

export function nextBusinessDay(date: ISODate): ISODate {
  let d = addDays(date, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The list of days currently open for booking: today (when it's a business
 * day) plus the next BOOKING_HORIZON_BUSINESS_DAYS business days. Weekends are
 * never bookable.
 *
 *   Thu -> [Thu, Fri, Mon]
 *   Fri -> [Fri, Mon, Tue]
 *   Sat -> [Mon, Tue]
 *   Sun -> [Mon, Tue]
 */
export function getBookableDates(now: Date = new Date()): ISODate[] {
  const today = todayInOfficeTz(now);
  const dates: ISODate[] = [];
  if (!isWeekend(today)) dates.push(today);
  let cursor = today;
  for (let i = 0; i < BOOKING_HORIZON_BUSINESS_DAYS; i++) {
    cursor = nextBusinessDay(cursor);
    dates.push(cursor);
  }
  return dates;
}

export function isBookableDate(date: ISODate, now: Date = new Date()): boolean {
  return getBookableDates(now).includes(date);
}

/**
 * Weekdays on which a management spot is prebooked for its owner, stored as
 * a comma-separated list of ISO weekday numbers, e.g. "1,2,3,4,5".
 */
export function parsePrebookDays(value: string): number[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    ),
  ].sort();
}

export function isPrebookDay(prebookDays: string, date: ISODate): boolean {
  return parsePrebookDays(prebookDays).includes(isoWeekday(date));
}

// ---------- Localized formatting ----------
//
// Formatting helpers take an optional UI locale ("pl" | "en"). When omitted,
// client-side code falls back to the locale cookie (set by the language
// switcher); on the server the app default (Polish) applies — server
// components that render dates should pass the locale explicitly.

type UiLocale = "pl" | "en";

function currentUiLocale(): UiLocale {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|;\s*)locale=(pl|en)\b/);
    if (match) return match[1] as UiLocale;
  }
  return "pl";
}

function intlLocale(locale?: UiLocale): string {
  return (locale ?? currentUiLocale()) === "pl" ? "pl-PL" : "en-GB";
}

const WEEKDAY_NAMES: Record<UiLocale, string[]> = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  pl: ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"],
};

export function weekdayShortName(isoDay: number, locale?: UiLocale): string {
  return WEEKDAY_NAMES[locale ?? currentUiLocale()][isoDay - 1] ?? "?";
}

/** "Mon, 14 Jul" / "pon., 14 lip" — timezone-independent for a Y-M-D string. */
export function formatDateHuman(date: ISODate, locale?: UiLocale): string {
  const dt = toUtcDate(date);
  return dt.toLocaleDateString(intlLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "Monday, 14 July 2026" / "poniedziałek, 14 lipca 2026" */
export function formatDateLong(date: ISODate, locale?: UiLocale): string {
  const dt = toUtcDate(date);
  return dt.toLocaleDateString(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const RELATIVE_LABELS: Record<UiLocale, { today: string; tomorrow: string }> = {
  en: { today: "Today", tomorrow: "Tomorrow" },
  pl: { today: "Dziś", tomorrow: "Jutro" },
};

export function relativeDayLabel(
  date: ISODate,
  locale?: UiLocale,
  now: Date = new Date()
): string {
  const labels = RELATIVE_LABELS[locale ?? currentUiLocale()];
  const today = todayInOfficeTz(now);
  if (date === today) return labels.today;
  if (date === addDays(today, 1)) return labels.tomorrow;
  return formatDateHuman(date, locale);
}
