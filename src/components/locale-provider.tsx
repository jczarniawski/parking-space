"use client";

// Client-side locale context. The initial locale comes from the server
// (cookie-derived) so the first paint always matches the SSR output; switching
// writes the cookie and refreshes the RSC tree so server-rendered text
// changes too.

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  LOCALE_COOKIE,
  Locale,
  TranslateParams,
  Translator,
  makeT,
  makeTPlural,
} from "@/lib/i18n";

type LocaleContextValue = {
  locale: Locale;
  t: Translator;
  tPlural: (base: string, count: number, params?: TranslateParams) => string;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      setLocaleState(next);
      // <html lang> and any server-rendered text re-render with the cookie.
      router.refresh();
    },
    [router]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: makeT(locale),
      tPlural: makeTPlural(locale),
      setLocale,
    }),
    [locale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return ctx;
}
