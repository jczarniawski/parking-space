"use client";

// Employee dashboard: date chips for the bookable window, the spot grid for
// the selected day, book/cancel with a confirm step, and (for management
// members) a release/reclaim banner for their reserved spot on that day.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { BoardSpot } from "@/lib/services/bookings";
import { formatDateHuman, formatDateLong, relativeDayLabel } from "@/lib/dates";
import {
  Button,
  Card,
  EmptyState,
  Spinner,
  apiFetch,
  cn,
} from "@/components/ui";

type Availability = {
  date: string;
  spots: BoardSpot[];
  myBooking: { bookingId: string; spotNumber: string } | null;
  myReservedSpot: { spotId: string; number: string; released: boolean } | null;
  bookableDates: string[];
};

type PendingAction =
  | { kind: "book"; spotId: string; number: string }
  | { kind: "cancel"; bookingId: string; number: string };

function firstName(fullName: string): string {
  const beforeAt = fullName.split("@")[0] || fullName;
  return beforeAt.trim().split(/\s+/)[0] || fullName;
}

function tileStatus(spot: BoardSpot): { text: string; classes: string } {
  if (spot.status === "booked") {
    if (spot.bookedByMe) {
      return {
        text: "Yours",
        classes: "border-brand-400 bg-brand-50 text-brand-800 hover:bg-brand-100",
      };
    }
    return {
      text: spot.bookedByName ? firstName(spot.bookedByName) : "Booked",
      classes: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (spot.status === "reserved") {
    if (spot.ownedByMe) {
      return {
        text: "Yours • reserved",
        classes: "border-amber-300 bg-amber-50 text-amber-800",
      };
    }
    return {
      text: spot.ownerName ? `Reserved • ${firstName(spot.ownerName)}` : "Reserved",
      classes: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  return {
    text: spot.released ? "Free • released" : "Free",
    classes: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  };
}

function SpotTile({
  spot,
  busy,
  selected,
  onPick,
}: {
  spot: BoardSpot;
  busy: boolean;
  selected: boolean;
  onPick: (spot: BoardSpot) => void;
}) {
  const mine = spot.status === "booked" && !!spot.bookedByMe;
  const clickable = spot.status === "available" || mine;
  const { text, classes } = tileStatus(spot);

  return (
    <button
      type="button"
      disabled={!clickable || busy}
      onClick={() => onPick(spot)}
      aria-label={`Spot ${spot.number}: ${text}`}
      className={cn(
        "flex min-h-[76px] w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-3 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        classes,
        !clickable && "cursor-not-allowed",
        busy && "opacity-60",
        selected && "ring-2 ring-brand-600 ring-offset-1"
      )}
    >
      <span className="text-xl font-bold leading-none sm:text-2xl">
        {spot.number}
      </span>
      <span className="max-w-full truncate text-[11px] leading-tight sm:text-xs">
        {text}
      </span>
    </button>
  );
}

export function BookingBoard({ role }: { role: string }) {
  const [board, setBoard] = useState<Availability | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const load = useCallback(async (date?: string | null) => {
    setRefreshing(true);
    try {
      const url = date
        ? `/api/availability?date=${encodeURIComponent(date)}`
        : "/api/availability";
      const data = await apiFetch<Availability>(url);
      setBoard(data);
      setSelectedDate(data.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-dismiss notices.
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

  function selectDate(date: string) {
    if (date === selectedDate || busy) return;
    setPending(null);
    setSelectedDate(date);
    void load(date);
  }

  async function runMutation(fn: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await fn();
      setFlash(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(null);
      setBusy(false);
      await load(selectedDate);
    }
  }

  function pickSpot(spot: BoardSpot) {
    if (spot.status === "available") {
      setPending({ kind: "book", spotId: spot.spotId, number: spot.number });
    } else if (spot.status === "booked" && spot.bookedByMe && spot.bookingId) {
      setPending({
        kind: "cancel",
        bookingId: spot.bookingId,
        number: spot.number,
      });
    }
  }

  function confirmPending() {
    if (!pending || !board) return;
    const date = board.date;
    if (pending.kind === "book") {
      const { spotId, number } = pending;
      void runMutation(
        () =>
          apiFetch("/api/bookings", {
            method: "POST",
            body: JSON.stringify({ spotId, date }),
          }),
        `Spot ${number} booked for ${formatDateHuman(date)}.`
      );
    } else {
      const { bookingId, number } = pending;
      void runMutation(
        () => apiFetch(`/api/bookings/${bookingId}`, { method: "DELETE" }),
        `Booking for spot ${number} cancelled.`
      );
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!board) {
    return (
      <Card>
        <EmptyState
          title="Couldn't load the parking board"
          hint={error ?? "Please try again."}
        />
        <div className="flex justify-center pb-8">
          <Button
            variant="secondary"
            onClick={() => {
              setLoading(true);
              void load(selectedDate);
            }}
          >
            Try again
          </Button>
        </div>
      </Card>
    );
  }

  const myBooking = board.myBooking;
  const reserved = board.myReservedSpot;

  return (
    <div className="space-y-4">
      {/* Date chips */}
      <div className="flex flex-wrap items-center gap-2">
        {board.bookableDates.map((date) => {
          const active = date === board.date;
          return (
            <button
              key={date}
              type="button"
              onClick={() => selectDate(date)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                active
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              {relativeDayLabel(date)}
            </button>
          );
        })}
        {refreshing ? <Spinner className="h-4 w-4" /> : null}
      </div>
      <p className="text-sm text-slate-500">{formatDateLong(board.date)}</p>

      {/* Notices */}
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
      {flash ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {flash}
        </div>
      ) : null}

      {/* My booking banner */}
      {myBooking ? (
        <div className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-brand-900">
            You have spot{" "}
            <span className="font-semibold">{myBooking.spotNumber}</span> booked
            for {formatDateLong(board.date)}.
          </p>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              setPending({
                kind: "cancel",
                bookingId: myBooking.bookingId,
                number: myBooking.spotNumber,
              })
            }
          >
            Cancel booking
          </Button>
        </div>
      ) : null}

      {/* Management reserved-spot banner for the selected day */}
      {reserved ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-900">
            {reserved.released ? (
              <>
                You&apos;ve released spot{" "}
                <span className="font-semibold">{reserved.number}</span> for{" "}
                {formatDateLong(board.date)} — anyone can book it.
              </>
            ) : (
              <>
                Spot <span className="font-semibold">{reserved.number}</span> is
                reserved for you on {formatDateLong(board.date)}.
              </>
            )}
          </p>
          {reserved.released ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runMutation(
                  () =>
                    apiFetch(
                      `/api/releases?date=${encodeURIComponent(board.date)}`,
                      { method: "DELETE" }
                    ),
                  `Spot ${reserved.number} reclaimed for ${formatDateHuman(board.date)}.`
                )
              }
            >
              Reclaim
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runMutation(
                  () =>
                    apiFetch("/api/releases", {
                      method: "POST",
                      body: JSON.stringify({ date: board.date }),
                    }),
                  `Spot ${reserved.number} released for ${formatDateHuman(board.date)}.`
                )
              }
            >
              Release for this day
            </Button>
          )}
        </div>
      ) : null}

      {/* Confirm step */}
      {pending ? (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700">
            {pending.kind === "book" ? (
              <>
                Book spot <span className="font-semibold">{pending.number}</span>{" "}
                for {formatDateLong(board.date)}?
              </>
            ) : (
              <>
                Cancel your booking of spot{" "}
                <span className="font-semibold">{pending.number}</span> for{" "}
                {formatDateLong(board.date)}?
              </>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant={pending.kind === "book" ? "primary" : "danger"}
              disabled={busy}
              onClick={confirmPending}
            >
              {busy
                ? "Working…"
                : pending.kind === "book"
                  ? "Book it"
                  : "Cancel booking"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Never mind
            </Button>
          </div>
        </div>
      ) : null}

      {/* Spot grid */}
      {board.spots.length === 0 ? (
        <Card>
          <EmptyState
            title="No active parking spots"
            hint="An administrator hasn't added any spots yet."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6 lg:grid-cols-8">
          {board.spots.map((spot) => (
            <SpotTile
              key={spot.spotId}
              spot={spot}
              busy={busy}
              selected={
                !!pending &&
                ((pending.kind === "book" && pending.spotId === spot.spotId) ||
                  (pending.kind === "cancel" &&
                    spot.bookingId === pending.bookingId))
              }
              onPick={pickSpot}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          Free
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          Booked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          Reserved
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
          Yours
        </span>
      </div>

      {role === "MANAGEMENT" || role === "ADMIN" ? (
        <p className="text-xs text-slate-400">
          Own a reserved spot? Plan future releases on{" "}
          <Link
            href="/my-bookings"
            className="font-medium text-brand-600 hover:underline"
          >
            My bookings
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
