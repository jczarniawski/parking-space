"use client";

// The parking board: zone tabs + date chips for the bookable window, the spot
// grid for the selected day, book/cancel with a confirm step (with a vehicle
// picker), and (for management members) a release/reclaim banner for their
// reserved spot on that day.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BoardSpot } from "@/lib/services/bookings";
import { formatDateHuman, formatDateLong, relativeDayLabel } from "@/lib/dates";
import { useLocale } from "@/components/locale-provider";
import type { Translator } from "@/lib/i18n";
import {
  Button,
  Card,
  EmptyState,
  Spinner,
  apiFetch,
  cn,
} from "@/components/ui";

type Zone = { id: string; name: string; spotCount: number };

type Vehicle = { id: string; plate: string };

type Availability = {
  date: string;
  spots: BoardSpot[];
  myBooking: { bookingId: string; spotNumber: string } | null;
  myReservedSpot: {
    spotId: string;
    number: string;
    released: boolean;
    bookedBy: string | null;
  } | null;
  bookableDates: string[];
  zones: Zone[];
  zoneId: string | null;
};

type PendingAction =
  | { kind: "book"; spotId: string; number: string }
  | { kind: "cancel"; bookingId: string; number: string };

function firstName(fullName: string): string {
  const beforeAt = fullName.split("@")[0] || fullName;
  return beforeAt.trim().split(/\s+/)[0] || fullName;
}

// Reserved spots deliberately render exactly like booked ones — to everyone
// but the owner they're simply taken, and the owner acts via the banner.
function tileStatus(
  spot: BoardSpot,
  t: Translator
): { text: string; classes: string } {
  if (spot.status === "booked") {
    if (spot.bookedByMe) {
      return {
        text: t("common.yours"),
        classes: "border-brand-400 bg-brand-50 text-brand-800 hover:bg-brand-100",
      };
    }
    return {
      text: spot.bookedByName ? firstName(spot.bookedByName) : t("common.taken"),
      classes: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (spot.status === "reserved") {
    return {
      text: spot.ownedByMe
        ? t("common.yours")
        : spot.ownerName
          ? firstName(spot.ownerName)
          : t("common.taken"),
      classes: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  return {
    text: spot.released ? t("board.freeReleased") : t("common.free"),
    classes: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  };
}

function SpotTile({
  spot,
  busy,
  selected,
  hasBookingToday,
  onPick,
}: {
  spot: BoardSpot;
  busy: boolean;
  selected: boolean;
  hasBookingToday: boolean;
  onPick: (spot: BoardSpot) => void;
}) {
  const { t } = useLocale();
  const mine = spot.status === "booked" && !!spot.bookedByMe;
  // Not clickable: your own released spot (reclaim via the banner instead)
  // and free spots while you already hold a booking for this day (the server
  // enforces one spot per person per day).
  const bookable =
    spot.status === "available" &&
    !hasBookingToday &&
    !(spot.ownedByMe && spot.released);
  const clickable = bookable || mine;
  const { text, classes } = tileStatus(spot, t);

  return (
    <button
      type="button"
      disabled={!clickable || busy}
      onClick={() => onPick(spot)}
      aria-label={t("board.spotAria", { number: spot.number, status: text })}
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
  const { t, locale } = useLocale();
  const [board, setBoard] = useState<Availability | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // null = "all spots" (used only when no zones exist); the first response
  // picks the default zone.
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  // Vehicle picker for the booking confirm step.
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [newPlate, setNewPlate] = useState("");
  const [savingPlate, setSavingPlate] = useState(false);
  const [plateError, setPlateError] = useState<string | null>(null);

  const loadSeq = useRef(0);
  // `zone === undefined` marks the bootstrap request: it fetches without a
  // zone filter, then re-requests scoped to the first zone (when zones exist)
  // so the grid only ever shows one zone at a time.
  const load = useCallback(
    async (date?: string | null, zone?: string | null) => {
      const seq = ++loadSeq.current;
      setRefreshing(true);
      try {
        const params = new URLSearchParams();
        if (date) params.set("date", date);
        if (zone) params.set("zone", zone);
        const qs = params.toString();
        let data = await apiFetch<Availability>(
          `/api/availability${qs ? `?${qs}` : ""}`
        );
        // A slower earlier response must not overwrite the day/zone the user
        // actually selected.
        if (seq !== loadSeq.current) return;
        if (zone === undefined && data.zones.length > 0) {
          const defaultZone = data.zones[0].id;
          setSelectedZone(defaultZone);
          data = await apiFetch<Availability>(
            `/api/availability?date=${encodeURIComponent(data.date)}&zone=${encodeURIComponent(defaultZone)}`
          );
          if (seq !== loadSeq.current) return;
        }
        setBoard(data);
        setSelectedDate(data.date);
      } catch (err) {
        if (seq !== loadSeq.current) return;
        setError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
      } finally {
        if (seq === loadSeq.current) {
          setRefreshing(false);
          setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Fetch the user's saved plates once; preselect the first one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ vehicles: Vehicle[] }>("/api/vehicles");
        if (cancelled) return;
        setVehicles(data.vehicles);
        if (data.vehicles.length > 0) {
          setVehicleId((current) => current || data.vehicles[0].id);
        }
      } catch {
        if (!cancelled) setVehicles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    void load(date, selectedZone);
  }

  function selectZone(zoneId: string) {
    if (zoneId === selectedZone || busy) return;
    setPending(null);
    setSelectedZone(zoneId);
    void load(selectedDate, zoneId);
  }

  async function runMutation(fn: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await fn();
      setFlash(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setPending(null);
      setBusy(false);
      await load(selectedDate, selectedZone);
    }
  }

  async function savePlate() {
    const plate = newPlate.trim();
    if (!plate) return;
    setSavingPlate(true);
    setPlateError(null);
    try {
      const data = await apiFetch<{ vehicle: Vehicle }>("/api/vehicles", {
        method: "POST",
        body: JSON.stringify({ plate }),
      });
      setVehicles((prev) => [...(prev ?? []), data.vehicle]);
      setVehicleId(data.vehicle.id);
      setNewPlate("");
    } catch (err) {
      setPlateError(
        err instanceof Error ? err.message : t("qb.plateSaveFailed")
      );
    } finally {
      setSavingPlate(false);
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
      if (!vehicleId) return;
      const { spotId, number } = pending;
      const chosenVehicleId = vehicleId;
      void runMutation(
        () =>
          apiFetch("/api/bookings", {
            method: "POST",
            body: JSON.stringify({ spotId, date, vehicleId: chosenVehicleId }),
          }),
        t("board.bookedFlash", { number, date: formatDateHuman(date, locale) })
      );
    } else {
      const { bookingId, number } = pending;
      void runMutation(
        () => apiFetch(`/api/bookings/${bookingId}`, { method: "DELETE" }),
        t("board.cancelledFlash", { number })
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
          title={t("board.loadFailedTitle")}
          hint={error ?? t("start.pleaseRetry")}
        />
        <div className="flex justify-center pb-8">
          <Button
            variant="secondary"
            onClick={() => {
              setLoading(true);
              void load(selectedDate, selectedZone);
            }}
          >
            {t("common.tryAgain")}
          </Button>
        </div>
      </Card>
    );
  }

  const myBooking = board.myBooking;
  const reserved = board.myReservedSpot;

  return (
    <div className="space-y-4">
      {/* Zone tabs */}
      {board.zones.length > 0 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {board.zones.map((zone) => {
            const active = zone.id === selectedZone;
            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => selectZone(zone.id)}
                aria-pressed={active}
                className={cn(
                  "min-h-[44px] shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                  active
                    ? "bg-brand-700 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {zone.name}
              </button>
            );
          })}
        </div>
      ) : null}

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
                "min-h-[44px] rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                active
                  ? "bg-brand-700 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {relativeDayLabel(date, locale)}
            </button>
          );
        })}
        {refreshing ? <Spinner className="h-4 w-4" /> : null}
      </div>
      <p className="text-sm text-slate-500">{formatDateLong(board.date, locale)}</p>

      {/* Notices */}
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
      {flash ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {flash}
        </div>
      ) : null}

      {/* My booking banner */}
      {myBooking ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-sm text-brand-900">
            {t("board.myBooking", {
              number: myBooking.spotNumber,
              date: formatDateLong(board.date, locale),
            })}
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
            {t("board.cancelBooking")}
          </Button>
        </div>
      ) : null}

      {/* Management reserved-spot banner for the selected day */}
      {reserved ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-sm text-brand-900">
            {reserved.released
              ? reserved.bookedBy
                ? t("board.releasedBookedInfo", {
                    number: reserved.number,
                    date: formatDateLong(board.date, locale),
                    name: reserved.bookedBy,
                  })
                : t("board.releasedInfo", {
                    number: reserved.number,
                    date: formatDateLong(board.date, locale),
                  })
              : t("board.reservedForYouOn", {
                  number: reserved.number,
                  date: formatDateLong(board.date, locale),
                })}
          </p>
          {reserved.released ? (
            <Button
              variant="secondary"
              disabled={busy || !!reserved.bookedBy}
              title={reserved.bookedBy ? t("board.reclaimBlocked") : undefined}
              onClick={() =>
                void runMutation(
                  () =>
                    apiFetch(
                      `/api/releases?date=${encodeURIComponent(board.date)}`,
                      { method: "DELETE" }
                    ),
                  t("board.reclaimedFlash", {
                    number: reserved.number,
                    date: formatDateHuman(board.date, locale),
                  })
                )
              }
            >
              {t("board.reclaim")}
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
                  t("board.releasedFlash", {
                    number: reserved.number,
                    date: formatDateHuman(board.date, locale),
                  })
                )
              }
            >
              {t("board.releaseForDay")}
            </Button>
          )}
        </div>
      ) : null}

      {/* Confirm step */}
      {pending ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <p className="text-sm text-slate-700">
            {pending.kind === "book"
              ? t("board.confirmBook", {
                  number: pending.number,
                  date: formatDateLong(board.date, locale),
                })
              : t("board.confirmCancel", {
                  number: pending.number,
                  date: formatDateLong(board.date, locale),
                })}
          </p>

          {/* Vehicle picker — a booking always needs a plate */}
          {pending.kind === "book" ? (
            vehicles === null ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Spinner className="h-4 w-4" /> {t("board.loadingVehicles")}
              </div>
            ) : vehicles.length === 0 ? (
              <div>
                <label
                  htmlFor="board-new-plate"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  {t("board.addPlateLabel")}
                </label>
                <div className="flex gap-2">
                  <input
                    id="board-new-plate"
                    type="text"
                    value={newPlate}
                    maxLength={12}
                    placeholder={t("common.platePlaceholder")}
                    onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                    className="min-h-[44px] w-full min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                  <Button
                    variant="secondary"
                    className="min-h-[44px] shrink-0"
                    disabled={savingPlate || !newPlate.trim()}
                    onClick={() => void savePlate()}
                  >
                    {savingPlate ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
                {plateError ? (
                  <p className="mt-1.5 text-sm text-red-600">{plateError}</p>
                ) : null}
              </div>
            ) : (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  {t("common.vehicle")}
                </span>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : null}

          <div className="flex gap-2">
            <Button
              variant={pending.kind === "book" ? "primary" : "danger"}
              className="min-h-[44px]"
              disabled={busy || (pending.kind === "book" && !vehicleId)}
              onClick={confirmPending}
            >
              {busy
                ? t("board.working")
                : pending.kind === "book"
                  ? t("board.bookIt")
                  : t("board.cancelBooking")}
            </Button>
            <Button
              variant="ghost"
              className="min-h-[44px]"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              {t("board.neverMind")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Spot grid */}
      {board.spots.length === 0 ? (
        <Card>
          <EmptyState
            title={t("board.noSpotsTitle")}
            hint={
              board.zones.length > 0
                ? t("board.zoneEmptyHint")
                : t("board.noSpotsHint")
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
          {board.spots.map((spot) => (
            <SpotTile
              key={spot.spotId}
              spot={spot}
              busy={busy}
              hasBookingToday={!!myBooking}
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
          {t("board.legendFree")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          {t("board.legendTaken")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
          {t("board.legendYours")}
        </span>
      </div>

      {role === "MANAGEMENT" || role === "ADMIN" ? (
        <p className="text-xs text-slate-400">
          {t("board.planReleases")}{" "}
          <Link
            href="/my-bookings"
            className="font-medium text-brand-600 hover:underline"
          >
            {t("nav.bookings")}
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
