"use client";

// Start screen: navy hero greeting over a merged list of the viewer's
// upcoming bookings and (for management) the prebooked days of their reserved
// spot. Both render as the same card — car icon + zone, a huge spot number
// and the day — with a kebab menu for cancel / release / reclaim.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { HomeReservedDay } from "@/lib/services/bookings";
import { compareDates, relativeDayLabel } from "@/lib/dates";
import { useLocale } from "@/components/locale-provider";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Spinner,
  apiFetch,
  cn,
} from "@/components/ui";

type HomeBooking = {
  id: string;
  date: string;
  spotNumber: string;
  zoneName: string | null;
  plate: string | null;
};

type HomeData = {
  todayCount: number;
  upcoming: HomeBooking[];
  reserved: HomeReservedDay[];
  bookableDates: string[];
};

type CardItem =
  | ({ kind: "booking"; key: string } & HomeBooking)
  | ({ kind: "reserved"; key: string } & HomeReservedDay);

function firstName(nameOrEmail: string | null | undefined): string {
  if (!nameOrEmail) return "";
  const beforeAt = nameOrEmail.split("@")[0] || nameOrEmail;
  return beforeAt.trim().split(/\s+/)[0] || "";
}

// ---------- Icons (inline, no icon library) ----------

function CarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 16.5H3.8a1.3 1.3 0 0 1-1.3-1.3v-2.6c0-.9.62-1.68 1.5-1.9l1.8-.45 1.62-3A2 2 0 0 1 9.18 6.2h5.06c.6 0 1.18.27 1.56.74l2.05 2.5 2.15.54c.88.22 1.5 1.01 1.5 1.92v2.7c0 .72-.58 1.3-1.3 1.3H19" />
      <circle cx="7.5" cy="16.5" r="1.9" />
      <circle cx="16.5" cy="16.5" r="1.9" />
      <path d="M9.4 16.5h5.2" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.75V12l2.75 1.75" />
    </svg>
  );
}

function KebabIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="5.5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="18.5" r="1.5" />
    </svg>
  );
}

// ---------- Kebab menu ----------

type MenuAction = { label: string; danger?: boolean; onSelect: () => void };

function KebabMenu({
  actions,
  disabled,
  label,
}: {
  actions: MenuAction[];
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
      >
        <KebabIcon className="h-5 w-5" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-1 top-8 z-10 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={cn(
                "block w-full px-4 py-2.5 text-left text-sm font-medium",
                action.danger
                  ? "text-red-600 hover:bg-red-50"
                  : "text-slate-700 hover:bg-slate-50"
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------- Booking / reserved card ----------

function SpotCard({
  item,
  busy,
  confirmingCancel,
  onCancelRequest,
  onCancelConfirm,
  onCancelDismiss,
  onRelease,
  onReclaim,
}: {
  item: CardItem;
  busy: boolean;
  confirmingCancel: boolean;
  onCancelRequest: () => void;
  onCancelConfirm: () => void;
  onCancelDismiss: () => void;
  onRelease: () => void;
  onReclaim: () => void;
}) {
  const { t, locale } = useLocale();
  const actions: MenuAction[] =
    item.kind === "booking"
      ? [{ label: t("start.cancelBooking"), danger: true, onSelect: onCancelRequest }]
      : item.released
        ? item.bookedBy
          ? [] // a colleague booked the released day — nothing to do here
          : [{ label: t("start.reclaim"), onSelect: onReclaim }]
        : [{ label: t("start.releaseThisDay"), onSelect: onRelease }];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1">
          <CarIcon className="h-5 w-5 shrink-0 text-brand-600" />
          <span className="text-sm font-medium text-slate-600">
            {item.zoneName ?? t("common.parking")}
          </span>
          {item.kind === "reserved" ? (
            <Badge tone="slate">{t("start.reservedForYou")}</Badge>
          ) : null}
          {item.kind === "reserved" && item.released ? (
            item.bookedBy ? (
              <Badge tone="blue">{t("start.bookedBy", { name: item.bookedBy })}</Badge>
            ) : (
              <Badge tone="slate">{t("start.released")}</Badge>
            )
          ) : null}
        </div>
        <KebabMenu
          actions={actions}
          disabled={busy}
          label={t("start.actionsFor", {
            number: item.spotNumber,
            day: relativeDayLabel(item.date, locale),
          })}
        />
      </div>

      <p className="mt-1 text-5xl font-bold tracking-tight text-slate-800">
        {item.spotNumber}
      </p>

      <div className="mt-4 flex items-center gap-1.5 text-sm text-slate-500">
        <ClockIcon className="h-4 w-4 shrink-0" />
        <span>
          {t("common.allDay")} · {relativeDayLabel(item.date, locale)}
        </span>
        {item.kind === "booking" && item.plate ? (
          <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {item.plate}
          </span>
        ) : null}
      </div>

      {item.kind === "booking" && confirmingCancel ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
          <p className="text-sm font-medium text-red-700">{t("start.cancelConfirm")}</p>
          <div className="flex gap-1.5">
            <Button variant="danger" disabled={busy} onClick={onCancelConfirm}>
              {busy ? t("start.cancelling") : t("start.cancelIt")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onCancelDismiss}>
              {t("common.keep")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Screen ----------

export function StartScreen({
  name,
  role,
}: {
  name: string | null | undefined;
  role: string;
}) {
  const { t, tPlural } = useLocale();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  // Only sets the error on failure — a successful background refetch must
  // not clear a mutation error the user still needs to read.
  const load = useCallback(async () => {
    try {
      const fresh = await apiFetch<HomeData>("/api/home");
      setData(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setConfirmKey(null);
      setBusy(false);
      await load();
    }
  }

  const items = useMemo<CardItem[]>(() => {
    if (!data) return [];
    const merged: CardItem[] = [
      ...data.upcoming.map((b) => ({
        kind: "booking" as const,
        key: `b-${b.id}`,
        ...b,
      })),
      ...data.reserved.map((r) => ({
        kind: "reserved" as const,
        key: `r-${r.date}-${r.spotNumber}`,
        ...r,
      })),
    ];
    return merged.sort((a, b) => compareDates(a.date, b.date));
  }, [data]);

  const subtitle = !data
    ? t("start.loadingDay")
    : data.todayCount === 0
      ? t("start.noBookingsToday")
      : tPlural("start.bookingsToday", data.todayCount);

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Hero — bleeds past the layout's px-4/pt-4 padding to reach the screen edges. */}
      <section className="-mx-4 -mt-4 rounded-b-[2rem] bg-gradient-to-br from-brand-900 to-brand-700 px-6 pb-10 pt-8 text-white">
        <p className="text-2xl font-semibold leading-tight">
          {firstName(name)
            ? t("start.hi", { name: firstName(name) })
            : t("start.hiAnon")}
        </p>
        <p className="mt-1.5 text-sm text-brand-100">{subtitle}</p>
      </section>

      <div className="mt-5 space-y-3">
        {data && error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !data ? (
          <Card>
            <EmptyState
              title={t("start.loadFailedTitle")}
              hint={error ?? t("start.pleaseRetry")}
            />
            <div className="flex justify-center pb-8">
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  void load();
                }}
              >
                {t("common.tryAgain")}
              </Button>
            </div>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              title={t("start.emptyTitle")}
              hint={t("start.emptyHint")}
            />
            <div className="flex justify-center pb-8">
              <Link
                href="/book"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-accent-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-accent-700"
              >
                {t("start.quickBook")}
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("start.upcoming")}
            </h2>
            {items.map((item) => (
              <SpotCard
                key={item.key}
                item={item}
                busy={busy}
                confirmingCancel={confirmKey === item.key}
                onCancelRequest={() => setConfirmKey(item.key)}
                onCancelConfirm={() => {
                  if (item.kind !== "booking") return;
                  void runAction(() =>
                    apiFetch(`/api/bookings/${item.id}`, { method: "DELETE" })
                  );
                }}
                onCancelDismiss={() => setConfirmKey(null)}
                onRelease={() => {
                  if (item.kind !== "reserved") return;
                  void runAction(() =>
                    apiFetch("/api/releases", {
                      method: "POST",
                      body: JSON.stringify({ date: item.date }),
                    })
                  );
                }}
                onReclaim={() => {
                  if (item.kind !== "reserved") return;
                  void runAction(() =>
                    apiFetch(`/api/releases?date=${encodeURIComponent(item.date)}`, {
                      method: "DELETE",
                    })
                  );
                }}
              />
            ))}
            {role === "MANAGEMENT" || role === "ADMIN" ? (
              <p className="px-1 text-xs text-slate-400">
                {t("start.planReleases")}{" "}
                <Link
                  href="/my-bookings"
                  className="font-medium text-brand-600 hover:underline"
                >
                  {t("nav.bookings")}
                </Link>
                .
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
