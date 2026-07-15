"use client";

// The signed-in user's bookings: upcoming ones (cancellable) as cards in the
// Start-screen style, and a muted read-only history of past ones, from
// GET /api/bookings.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDateHuman, relativeDayLabel } from "@/lib/dates";
import { Button, Card, EmptyState, Spinner, apiFetch } from "@/components/ui";

type MyBooking = {
  id: string;
  date: string;
  spotNumber: string;
  zoneName: string | null;
  plate: string | null;
  isPast: boolean;
  canCancel: boolean;
};

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

export function MyBookingsList() {
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ bookings: MyBooking[] }>("/api/bookings");
      setBookings(data.bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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

  async function cancel(id: string) {
    setCancellingId(id);
    setError(null);
    try {
      await apiFetch<{ ok: boolean }>(`/api/bookings/${id}`, {
        method: "DELETE",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setCancellingId(null);
      setConfirmId(null);
      await load();
    }
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!bookings) {
    return (
      <Card>
        <EmptyState
          title="Couldn't load your bookings"
          hint={error ?? "Please try again."}
        />
        <div className="flex justify-center pb-8">
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }

  // API returns newest first: show upcoming soonest-first, past newest-first.
  const upcoming = bookings.filter((b) => !b.isPast).reverse();
  const past = bookings.filter((b) => b.isPast);

  return (
    <div className="space-y-5">
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-card">
            <EmptyState
              title="No upcoming bookings"
              hint="Grab a spot with Quick book or from the parking board."
            />
            <div className="flex justify-center gap-2 pb-8">
              <Link
                href="/book"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-accent-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-700"
              >
                Quick book
              </Link>
              <Link
                href="/board"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Open board
              </Link>
            </div>
          </div>
        ) : (
          upcoming.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <CarIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      Spot {b.spotNumber}
                      <span className="font-normal text-slate-500">
                        {" "}
                        · {b.zoneName ?? "Parking"}
                      </span>
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {relativeDayLabel(b.date)}
                      {b.plate ? ` · ${b.plate}` : null}
                    </p>
                  </div>
                </div>
                {b.canCancel && confirmId !== b.id ? (
                  <Button
                    variant="secondary"
                    className="min-h-[44px] shrink-0"
                    disabled={cancellingId !== null}
                    onClick={() => setConfirmId(b.id)}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
              {b.canCancel && confirmId === b.id ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                  <p className="text-sm font-medium text-red-700">
                    Cancel this booking?
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      variant="danger"
                      disabled={cancellingId === b.id}
                      onClick={() => void cancel(b.id)}
                    >
                      {cancellingId === b.id ? "Cancelling…" : "Cancel it"}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={cancellingId === b.id}
                      onClick={() => setConfirmId(null)}
                    >
                      Keep
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Past
        </h2>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 shadow-card">
          {past.length === 0 ? (
            <EmptyState title="No past bookings yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {past.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <CarIcon className="h-5 w-5 shrink-0 text-slate-300" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-500">
                        Spot {b.spotNumber}
                        <span className="font-normal text-slate-400">
                          {" "}
                          · {b.zoneName ?? "Parking"}
                        </span>
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {formatDateHuman(b.date)}
                        {b.plate ? ` · ${b.plate}` : null}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">Past</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
