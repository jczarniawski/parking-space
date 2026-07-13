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
import { Badge, Button, Card, EmptyState, apiFetch } from "@/components/ui";

type ReleasesData = {
  spot: { id: string; number: string; prebookDays: string } | null;
  releases: { id: string; date: string; bookedBy: string | null }[];
};

export function ReleasesPanel() {
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
    .map(weekdayShortName)
    .join(", ");

  async function submitRelease(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFlash(null);
    if (!isValidISODate(date)) {
      setError("Pick a date to release first.");
      return;
    }
    if (date < today) {
      setError("You can't release your spot for a past day.");
      return;
    }
    if (date > maxDate) {
      setError(
        `Releases can be made at most ${RELEASE_HORIZON_DAYS} days in advance.`
      );
      return;
    }
    if (isWeekend(date)) {
      setError("Weekends aren't working days — there's nothing to release.");
      return;
    }
    if (!isPrebookDay(spot.prebookDays, date)) {
      setError(
        `Your spot is only prebooked for you on ${prebookDayNames} — pick one of those days.`
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/releases", {
        method: "POST",
        body: JSON.stringify({ date }),
      });
      setFlash(`Spot ${spot.number} released for ${formatDateHuman(date)}.`);
      setDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
        `Spot ${spot.number} reclaimed for ${formatDateHuman(releaseDate)}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setReclaimingDate(null);
      await load();
    }
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          My reserved spot
        </h2>
        <Badge tone="amber">Spot {spot.number}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Prebooked for you on {prebookDayNames}. Release it for days you
        won&apos;t need it, so colleagues can book it.
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
      {flash ? (
        <div
          role="status"
          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {flash}
        </div>
      ) : null}

      <form
        onSubmit={submitRelease}
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <label className="flex-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Release for date
          </span>
          <input
            type="date"
            value={date}
            min={today}
            max={maxDate}
            required
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>
        <Button type="submit" disabled={busy || !date}>
          {busy ? "Releasing…" : "Release"}
        </Button>
      </form>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-slate-700">
          Upcoming releases
        </h3>
        {releases.length === 0 ? (
          <EmptyState
            title="No upcoming releases"
            hint="Your spot stays reserved for you."
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
                      {relativeDayLabel(r.date)}
                    </p>
                    {r.bookedBy ? (
                      <p className="truncate text-xs text-rose-600">
                        Booked by {r.bookedBy}
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-600">
                        Still free — you can reclaim it
                      </p>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    disabled={!!r.bookedBy || reclaimingDate === r.date}
                    title={
                      r.bookedBy
                        ? `${r.bookedBy} already booked it for this day`
                        : undefined
                    }
                    onClick={() => void reclaim(r.date)}
                  >
                    {reclaimingDate === r.date ? "Reclaiming…" : "Reclaim"}
                  </Button>
                </li>
              ))}
            </ul>
            {releases.some((r) => r.bookedBy) ? (
              <p className="mt-2 text-xs text-slate-400">
                Days a colleague has already booked can&apos;t be reclaimed.
              </p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
