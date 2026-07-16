"use client";

// PL / EN segmented control. Used on the Profile page and the login screen.

import { Locale } from "@/lib/i18n";
import { useLocale } from "@/components/locale-provider";
import { cn } from "@/components/ui";

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "pl", label: "Polski" },
  { value: "en", label: "English" },
];

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();

  return (
    <div
      role="group"
      aria-label="Language / Język"
      className={cn(
        "inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1",
        compact ? "gap-0.5" : "gap-1"
      )}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === locale;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(opt.value)}
            className={cn(
              "rounded-lg text-sm font-medium transition-colors",
              compact ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5",
              active
                ? "bg-white text-brand-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {compact ? opt.value.toUpperCase() : opt.label}
          </button>
        );
      })}
    </div>
  );
}
