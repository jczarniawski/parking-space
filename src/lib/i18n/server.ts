// Server-side locale helpers (pages, layouts, route handlers).

import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  Locale,
  Translator,
  isLocale,
  makeT,
} from "./index";

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getT(): Promise<Translator> {
  return makeT(await getLocale());
}
