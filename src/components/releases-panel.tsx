"use client";

// Management-only "My reserved spot" panel: shows the owned spot and its
// prebook weekdays, lets the owner release it for a future date, and lists
// upcoming releases with reclaim buttons. Renders nothing for users without
// a reserved spot (GET /api/releases → spot: null).

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  RELEASE_HORIZON_DAYS,
  addDays,
  formatDateHuman,
  isPrebookDay,
  isValidISODate,
  isWeekend,
  parsePrebookDays,
  relativeDayLabel,
  todayInOfficeTz,
  weekdayShortName,
} from "@/lib/dates";
import { useLocale } from "@/components/locale-provider";
import { Badge, Button, EmptyState, apiFetch } from "@/components/ui";

type ReleasesData = {
  spot: { id: string; number: string; prebookDays: string } | null;
  releases: { id: string; date: string; bookedBy: string | null }[];
};

export function ReleasesPanel() {
  const { t, locale } = useLocale();
  const [data, setData] = useState<ReleasesData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [reclaimingDate, setReclaimingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<ReleasesData>("/api/releases");
      setData(d);
    } catch {
      // Can't tell whether the viewer has a reserved spot — stay hidden.
      setData(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  if (!loaded || !data?.spot) return null;

  const spot = data.spot;
  const releases = data.releases;
  const today = todayInOfficeTz();
  const maxDate = addDays(today, RELEASE_HORIZON_DAYS);
  const prebookDayNames = parsePrebookDays(spot.prebookDays)
    .map((d) => weekdayShortName(d, locale))
    .join(", ");

  async function submitRelease(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFlash(null);
    if (!isValidISODate(date)) {
      setError(t("rel.pickDate"));
      return;
    }
    if (date < today) {
      setError(t("rel.pastDay"));
      return;
    }
    if (date > maxDate) {
      setError(t("rel.horizon", { days: RELEASE_HORIZON_DAYS }));
      return;
    }
    if (isWeekend(date)) {
      setError(t("rel.weekend"));
      return;
    }
    if (!isPrebookDay(spot.prebookDays, date)) {
      setError(t("rel.notPrebook", { days: prebookDayNames }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/releases", {
        method: "POST",
        body: JSON.stringify({ date }),
      });
      setFlash(
        t("rel.releasedFlash", {
          number: spot.number,
          date: formatDateHuman(date, locale),
        })
      );
      setDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function reclaim(releaseDate: string) {
    setReclaimingDate(releaseDate);
    setError(null);
    setFlash(null);
    try {
      await apiFetch<{ ok: boolean }>(
        `/api/releases?date=${encodeURIComponent(releaseDate)}`,
        { method: "DELETE" }
      );
      setFlash(
        t("rel.reclaimedFlash", {
          number: spot.number,
          date: formatDateHuman(releaseDate, locale),
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setReclaimingDate(null);
      await load();
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          {t("rel.title")}
        </h2>
        <Badge tone="blue">{t("rel.spotBadge", { number: spot.number })}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {t("rel.prebookedOn", { days: prebookDayNames })}
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
      {flash ? (
        <div
          role="status"
          className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {flash}
        </div>
      ) : null}

      <form onSubmit={submitRelease} className="mt-4 flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            {t("rel.releaseForDate")}
          </span>
          <input
            type="date"
            value={date}
            min={today}
            max={maxDate}
            required
            onChange={(e) => setDate(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>
        <Button
          type="submit"
          className="min-h-[44px] shrink-0"
          disabled={busy || !date}
        >
          {busy ? t("rel.releasing") : t("rel.release")}
        </Button>
      </form>

      <div className="mt-5">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("rel.upcomingReleases")}
        </h3>
        {releases.length === 0 ? (
          <EmptyState
            title={t("rel.noneTitle")}
            hint={t("rel.noneHint")}
          />
        ) : (
          <>
            <ul className="mt-1 divide-y divide-slate-100">
              {releases.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {relativeDayLabel(r.date, locale)}
                    </p>
                    {r.bookedBy ? (
                      <p className="truncate text-xs text-rose-600">
                        {t("rel.bookedBy", { name: r.bookedBy })}
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-600">
                        {t("rel.stillFree")}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    className="min-h-[44px] shrink-0"
                    disabled={!!r.bookedBy || reclaimingDate === r.date}
                    title={
                      r.bookedBy
                        ? t("rel.reclaimBlockedTitle", { name: r.bookedBy })
                        : undefined
                    }
                    onClick={() => void reclaim(r.date)}
                  >
                    {reclaimingDate === r.date ? t("rel.reclaiming") : t("rel.reclaim")}
                  </Button>
                </li>
              ))}
            </ul>
            {releases.some((r) => r.bookedBy) ? (
              <p className="mt-2 text-xs text-slate-400">
                {t("rel.cantReclaimNote")}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
