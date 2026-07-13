"use client";

// The signed-in user's bookings: upcoming ones (cancellable) and a read-only
// history of past ones, from GET /api/bookings.

import { useCallback, useEffect, useState } from "react";
import { formatDateHuman, relativeDayLabel } from "@/lib/dates";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Spinner,
  apiFetch,
} from "@/components/ui";

type MyBooking = {
  id: string;
  date: string;
  spotNumber: string;
  isPast: boolean;
  canCancel: boolean;
};

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
    <div className="space-y-6">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <Card className="p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming bookings"
            hint="Book a spot from the dashboard for today or the next two business days."
          />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {upcoming.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Badge tone="blue">Spot {b.spotNumber}</Badge>
                  <p className="truncate text-sm font-medium text-slate-800">
                    {relativeDayLabel(b.date)}
                  </p>
                </div>
                {b.canCancel ? (
                  confirmId === b.id ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="danger"
                        disabled={cancellingId === b.id}
                        onClick={() => void cancel(b.id)}
                      >
                        {cancellingId === b.id ? "Cancelling…" : "Confirm"}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={cancellingId === b.id}
                        onClick={() => setConfirmId(null)}
                      >
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      className="shrink-0"
                      disabled={cancellingId !== null}
                      onClick={() => setConfirmId(b.id)}
                    >
                      Cancel
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Past</h2>
        {past.length === 0 ? (
          <EmptyState title="No past bookings yet" />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {past.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Badge tone="slate">Spot {b.spotNumber}</Badge>
                  <p className="truncate text-sm text-slate-500">
                    {formatDateHuman(b.date)}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">Past</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
