"use client";

// Quick booking (the FAB flow): a 3-step wizard where the user never picks a
// spot — the server auto-assigns the lowest free number in the chosen zone.
// Step 1 collects zone/date/vehicle, step 2 confirms, step 3 shows the
// assigned spot.

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateHuman, formatDateLong, relativeDayLabel } from "@/lib/dates";
import { Spinner, apiFetch, cn } from "@/components/ui";

type Zone = { id: string; name: string; spotCount: number };
type Vehicle = { id: string; plate: string };
type BookingResult = {
  id: string;
  date: string;
  spotNumber: string | null;
  zoneName: string | null;
  plate: string | null;
};

// "Today · Tue, 15 Jul", but just "Thu, 17 Jul" when the relative label is
// already the formatted date.
function dateLabel(date: string): string {
  const rel = relativeDayLabel(date);
  const human = formatDateHuman(date);
  return rel === human ? human : `${rel} · ${human}`;
}

// Shared control styles (48px tall — comfortable touch targets).
const selectClass =
  "block h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";
const accentBtn =
  "inline-flex h-12 items-center justify-center rounded-xl bg-accent-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-accent-300";
const ghostBtn =
  "inline-flex h-12 items-center justify-center rounded-xl px-5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300";
const brandBtn =
  "inline-flex h-12 items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-brand-300";

// ---------- Icons (inline, no icon library) ----------

function BackIcon({ className }: { className?: string }) {
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
      <path d="M15.5 5 8.5 12l7 7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
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
      <path d="m4.5 12.5 5 5L19.5 7" />
    </svg>
  );
}

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

function DeskIcon({ className }: { className?: string }) {
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
      <path d="M3.5 9h17" />
      <path d="M5.5 9v8.5M18.5 9v8.5" />
      <rect x="12" y="12" width="6.5" height="3.5" rx="0.75" />
    </svg>
  );
}

function MeetingRoomIcon({ className }: { className?: string }) {
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
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M12 16v3" />
      <path d="M8.5 19h7" />
    </svg>
  );
}

// ---------- Step indicator ----------

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((n, i) => (
        <Fragment key={n}>
          {i > 0 ? (
            <div
              className={cn(
                "h-0.5 w-10",
                step > i ? "bg-accent-600" : "bg-slate-200"
              )}
            />
          ) : null}
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
              n <= step ? "bg-accent-600 text-white" : "bg-slate-200 text-slate-500"
            )}
          >
            {n < step ? <CheckIcon className="h-4 w-4" /> : n}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// ---------- Wizard ----------

export function QuickBookWizard() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [zones, setZones] = useState<Zone[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [zoneId, setZoneId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const [plateInput, setPlateInput] = useState("");
  const [savingPlate, setSavingPlate] = useState(false);
  const [plateError, setPlateError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [z, h, v] = await Promise.all([
        apiFetch<{ zones: Zone[] }>("/api/zones"),
        apiFetch<{ bookableDates: string[] }>("/api/home"),
        apiFetch<{ vehicles: Vehicle[] }>("/api/vehicles"),
      ]);
      setZones(z.zones);
      setDates(h.bookableDates);
      setVehicles(v.vehicles);
      // Defaults: first zone (when zones exist), first bookable day, first
      // saved vehicle — kept if the user already picked something.
      setZoneId((cur) => cur ?? z.zones[0]?.id ?? null);
      setDate((cur) => cur || (h.bookableDates[0] ?? ""));
      setVehicleId((cur) => cur || (v.vehicles[0]?.id ?? ""));
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedZone = zones.find((z) => z.id === zoneId) ?? null;
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const canNext = (zones.length === 0 || !!zoneId) && !!date && !!vehicleId;

  async function savePlate() {
    const plate = plateInput.trim();
    if (!plate) return;
    setSavingPlate(true);
    setPlateError(null);
    try {
      const res = await apiFetch<{ vehicle: Vehicle }>("/api/vehicles", {
        method: "POST",
        body: JSON.stringify({ plate }),
      });
      setVehicles((prev) => [...prev, res.vehicle]);
      setVehicleId(res.vehicle.id);
      setPlateInput("");
    } catch (err) {
      setPlateError(
        err instanceof Error ? err.message : "Couldn't save the plate."
      );
    } finally {
      setSavingPlate(false);
    }
  }

  // Raw fetch (not apiFetch) because ZONE_FULL needs the error *code*, which
  // apiFetch discards.
  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrorCode(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(zoneId ? { zoneId } : {}),
          date,
          vehicleId,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        booking?: BookingResult;
        error?: string;
        code?: string;
      } | null;
      if (!res.ok || !body?.booking) {
        setSubmitError(body?.error ?? `Request failed (${res.status})`);
        setSubmitErrorCode(body?.code ?? null);
        return;
      }
      setResult(body.booking);
      setStep(3);
    } catch {
      setSubmitError("Something went wrong. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function bookAnother() {
    setResult(null);
    setSubmitError(null);
    setSubmitErrorCode(null);
    setStep(1);
    void load();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100"
        >
          <BackIcon className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-slate-900">Quick booking</h1>
      </div>

      <StepDots step={step} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : loadError ? (
        <div className="space-y-3">
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {loadError}
          </div>
          <button type="button" className={brandBtn} onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : step === 1 ? (
        /* ---------- Step 1: what, where, when ---------- */
        <div className="space-y-5">
          {/* Category */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              aria-pressed="true"
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-brand-700 px-2 py-3.5 text-white shadow-card"
            >
              <CarIcon className="h-6 w-6" />
              <span className="text-xs font-medium">Parking</span>
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="flex cursor-not-allowed flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3.5 text-slate-400"
            >
              <DeskIcon className="h-6 w-6" />
              <span className="text-xs font-medium">Desk</span>
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="flex cursor-not-allowed flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3.5 text-slate-400"
            >
              <MeetingRoomIcon className="h-6 w-6" />
              <span className="text-xs font-medium">Meeting room</span>
            </button>
          </div>

          {/* Zone */}
          {zones.length > 0 ? (
            <div>
              <label htmlFor="qb-zone" className={labelClass}>
                Zone
              </label>
              <select
                id="qb-zone"
                className={selectClass}
                value={zoneId ?? ""}
                onChange={(e) => setZoneId(e.target.value || null)}
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Date */}
          <div>
            <label htmlFor="qb-date" className={labelClass}>
              Date
            </label>
            <select
              id="qb-date"
              className={selectClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {dateLabel(d)}
                </option>
              ))}
            </select>
          </div>

          {/* Type — always "All day" for now */}
          <div>
            <span className={labelClass}>Type</span>
            <div className="flex h-12 w-full items-center justify-between rounded-full border border-brand-600 bg-brand-50 px-4 text-sm font-medium text-brand-800">
              <span>All day</span>
              <CheckIcon className="h-5 w-5 text-brand-700" />
            </div>
          </div>

          {/* Vehicle */}
          {vehicles.length > 0 ? (
            <div>
              <label htmlFor="qb-vehicle" className={labelClass}>
                Vehicle
              </label>
              <select
                id="qb-vehicle"
                className={selectClass}
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="qb-plate" className={labelClass}>
                Vehicle
              </label>
              <p className="mb-2 text-xs text-slate-500">
                Add your registration plate to book parking.
              </p>
              <div className="flex gap-2">
                <input
                  id="qb-plate"
                  value={plateInput}
                  onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                  maxLength={12}
                  placeholder="e.g. PY 1075E"
                  className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm uppercase text-slate-900 placeholder:normal-case focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                <button
                  type="button"
                  className={brandBtn}
                  disabled={savingPlate || !plateInput.trim()}
                  onClick={() => void savePlate()}
                >
                  {savingPlate ? "Saving…" : "Save"}
                </button>
              </div>
              {plateError ? (
                <p className="mt-1.5 text-sm text-red-600">{plateError}</p>
              ) : null}
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-2 pt-1">
            <Link href="/" className={ghostBtn}>
              Cancel
            </Link>
            <button
              type="button"
              className={cn(accentBtn, "flex-1")}
              disabled={!canNext}
              onClick={() => {
                setSubmitError(null);
                setSubmitErrorCode(null);
                setStep(2);
              }}
            >
              Next
            </button>
          </div>
        </div>
      ) : step === 2 ? (
        /* ---------- Step 2: confirm ---------- */
        <div className="space-y-4">
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-5 shadow-card">
            {zones.length > 0 ? (
              <div className="flex items-center justify-between py-3.5">
                <span className="text-sm text-slate-500">Zone</span>
                <span className="text-sm font-medium text-slate-800">
                  {selectedZone?.name ?? "—"}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-500">Date</span>
              <span className="text-sm font-medium text-slate-800">
                {dateLabel(date)}
              </span>
            </div>
            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-500">Type</span>
              <span className="text-sm font-medium text-slate-800">All day</span>
            </div>
            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-500">Vehicle</span>
              <span className="text-sm font-medium text-slate-800">
                {selectedVehicle?.plate ?? "—"}
              </span>
            </div>
          </div>

          <p className="text-sm text-slate-500">
            A free spot will be assigned automatically.
          </p>
          <Link
            href="/board"
            className="inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            …or pick a specific spot on the board
          </Link>

          {submitError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <p>{submitError}</p>
              {submitErrorCode === "ZONE_FULL" ? (
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                    onClick={() => {
                      setSubmitError(null);
                      setSubmitErrorCode(null);
                      setStep(1);
                    }}
                  >
                    Change zone
                  </button>
                  <Link
                    href="/board"
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    Open board
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className={ghostBtn}
              disabled={submitting}
              onClick={() => {
                setSubmitError(null);
                setSubmitErrorCode(null);
                setStep(1);
              }}
            >
              Back
            </button>
            <button
              type="button"
              className={cn(accentBtn, "flex-1")}
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </div>
      ) : (
        /* ---------- Step 3: success ---------- */
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckIcon className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-emerald-700">
              Booking confirmed
            </p>
            <p className="text-5xl font-bold tracking-tight text-slate-800">
              Spot {result?.spotNumber ?? "—"}
            </p>
            <p className="text-sm text-slate-500">
              {result?.zoneName ? `${result.zoneName} · ` : ""}
              {result ? formatDateLong(result.date) : ""}
            </p>
            {result?.plate ? (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {result.plate}
              </span>
            ) : null}
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" className={ghostBtn} onClick={bookAnother}>
              Book another
            </button>
            <Link href="/" className={cn(accentBtn, "flex-1")}>
              Done
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
