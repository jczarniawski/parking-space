"use client";

// Quick booking (the FAB flow): a 3-step wizard where the user never picks a
// spot — the server auto-assigns the lowest free number in the chosen zone.
// Step 1 collects zone/date/vehicle, step 2 confirms, step 3 shows the
// assigned spot.

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateHuman, formatDateLong, relativeDayLabel } from "@/lib/dates";
import { useLocale } from "@/components/locale-provider";
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
function dateLabel(date: string, locale: "pl" | "en"): string {
  const rel = relativeDayLabel(date, locale);
  const human = formatDateHuman(date, locale);
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

// ---------- Step indicator ----------

function StepDots({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center justify-center" aria-label={label}>
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
  const { t, locale } = useLocale();

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
        err instanceof Error ? err.message : t("common.somethingWentWrong")
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

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
        err instanceof Error ? err.message : t("qb.plateSaveFailed")
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
      setSubmitError(t("common.connectionError"));
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
          aria-label={t("qb.goBack")}
          className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100"
        >
          <BackIcon className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-slate-900">{t("qb.title")}</h1>
      </div>

      <StepDots step={step} label={t("qb.stepOf", { step })} />

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
            {t("common.tryAgain")}
          </button>
        </div>
      ) : step === 1 ? (
        /* ---------- Step 1: what, where, when ---------- */
        <div className="space-y-5">
          {/* Zone */}
          {zones.length > 0 ? (
            <div>
              <label htmlFor="qb-zone" className={labelClass}>
                {t("common.zone")}
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
              {t("common.date")}
            </label>
            <select
              id="qb-date"
              className={selectClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {dateLabel(d, locale)}
                </option>
              ))}
            </select>
          </div>

          {/* Type — always "All day" for now */}
          <div>
            <span className={labelClass}>{t("common.type")}</span>
            <div className="flex h-12 w-full items-center justify-between rounded-full border border-brand-600 bg-brand-50 px-4 text-sm font-medium text-brand-800">
              <span>{t("common.allDay")}</span>
              <CheckIcon className="h-5 w-5 text-brand-700" />
            </div>
          </div>

          {/* Vehicle */}
          {vehicles.length > 0 ? (
            <div>
              <label htmlFor="qb-vehicle" className={labelClass}>
                {t("common.vehicle")}
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
                {t("common.vehicle")}
              </label>
              <p className="mb-2 text-xs text-slate-500">
                {t("qb.addPlateHint")}
              </p>
              <div className="flex gap-2">
                <input
                  id="qb-plate"
                  value={plateInput}
                  onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                  maxLength={12}
                  placeholder={t("common.platePlaceholder")}
                  className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm uppercase text-slate-900 placeholder:normal-case focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                <button
                  type="button"
                  className={brandBtn}
                  disabled={savingPlate || !plateInput.trim()}
                  onClick={() => void savePlate()}
                >
                  {savingPlate ? t("common.saving") : t("common.save")}
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
              {t("common.cancel")}
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
              {t("common.next")}
            </button>
          </div>
        </div>
      ) : step === 2 ? (
        /* ---------- Step 2: confirm ---------- */
        <div className="space-y-4">
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-5 shadow-card">
            {zones.length > 0 ? (
              <div className="flex items-center justify-between py-3.5">
                <span className="text-sm text-slate-500">{t("common.zone")}</span>
                <span className="text-sm font-medium text-slate-800">
                  {selectedZone?.name ?? "—"}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-500">{t("common.date")}</span>
              <span className="text-sm font-medium text-slate-800">
                {dateLabel(date, locale)}
              </span>
            </div>
            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-500">{t("common.type")}</span>
              <span className="text-sm font-medium text-slate-800">{t("common.allDay")}</span>
            </div>
            <div className="flex items-center justify-between py-3.5">
              <span className="text-sm text-slate-500">{t("common.vehicle")}</span>
              <span className="text-sm font-medium text-slate-800">
                {selectedVehicle?.plate ?? "—"}
              </span>
            </div>
          </div>

          <p className="text-sm text-slate-500">{t("qb.autoAssignNote")}</p>
          <Link
            href="/board"
            className="inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            {t("qb.pickOnBoard")}
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
                    {t("qb.changeZone")}
                  </button>
                  <Link
                    href="/board"
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    {t("qb.openBoard")}
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
              {t("common.back")}
            </button>
            <button
              type="button"
              className={cn(accentBtn, "flex-1")}
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? t("qb.booking") : t("qb.confirmBooking")}
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
              {t("qb.confirmed")}
            </p>
            <p className="text-5xl font-bold tracking-tight text-slate-800">
              {t("common.spot", { number: result?.spotNumber ?? "—" })}
            </p>
            <p className="text-sm text-slate-500">
              {result?.zoneName ? `${result.zoneName} · ` : ""}
              {result ? formatDateLong(result.date, locale) : ""}
            </p>
            {result?.plate ? (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {result.plate}
              </span>
            ) : null}
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" className={ghostBtn} onClick={bookAnother}>
              {t("qb.bookAnother")}
            </button>
            <Link href="/" className={cn(accentBtn, "flex-1")}>
              {t("common.done")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
