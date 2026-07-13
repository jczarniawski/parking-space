"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { weekdayShortName } from "@/lib/dates";
import { Badge, Button, Card, apiFetch, cn } from "@/components/ui";

type AdminSpot = {
  id: string;
  number: string;
  isActive: boolean;
  prebookDays: string;
  owner: { id: string; name: string | null; email: string } | null;
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_WEEKDAYS = [1, 2, 3, 4, 5];

export function SetupWizard() {
  const [step, setStep] = useState<1 | 2>(1);
  const [spots, setSpots] = useState<AdminSpot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [spec, setSpec] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<string[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  // Step 2 state
  const [spotId, setSpotId] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [days, setDays] = useState<number[]>(ALL_WEEKDAYS);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState<
    { number: string; email: string }[]
  >([]);

  const loadSpots = useCallback(async () => {
    try {
      const data = await apiFetch<{ spots: AdminSpot[] }>("/api/admin/spots");
      setSpots(data.spots);
      return data.spots;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spots.");
      return [];
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadSpots();
  }, [loadSpots]);

  async function submitSpec(e: React.FormEvent) {
    e.preventDefault();
    if (!spec.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch<{ created: string[]; skipped: string[] }>(
        "/api/admin/spots",
        { method: "POST", body: JSON.stringify({ spec }) }
      );
      setCreated(data.created);
      setSkipped(data.skipped);
      setSpec("");
      await loadSpots();
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creating spots failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleDay(day: number) {
    setDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort()
    );
  }

  async function assignSpot(e: React.FormEvent) {
    e.preventDefault();
    if (!spotId || !ownerEmail.trim()) return;
    if (days.length === 0) {
      setError("Pick at least one weekday (Mon–Fri) for prebooking.");
      return;
    }
    setAssigning(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/spots/${spotId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ownerEmail: ownerEmail.trim(),
          prebookDays: days,
        }),
      });
      const spot = spots.find((s) => s.id === spotId);
      setAssigned((prev) => [
        ...prev,
        { number: spot?.number ?? "?", email: ownerEmail.trim() },
      ]);
      setSpotId("");
      setOwnerEmail("");
      setDays(ALL_WEEKDAYS);
      await loadSpots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed.");
    } finally {
      setAssigning(false);
    }
  }

  const unownedSpots = spots.filter((s) => !s.owner);

  return (
    <div className="space-y-4">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-xs font-medium">
        <span
          className={cn(
            "rounded-full px-2.5 py-1",
            step === 1
              ? "bg-brand-600 text-white"
              : "bg-brand-100 text-brand-700"
          )}
        >
          1 · Add spots
        </span>
        <span className="text-slate-300">—</span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1",
            step === 2 ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
          )}
        >
          2 · Management spots
        </span>
      </div>

      {step === 1 ? (
        <Card className="p-4 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">
            Which spot numbers does the office have?
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Enter numbers, ranges or labels separated by commas.
          </p>
          {loaded && spots.length > 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              {spots.length} spot{spots.length === 1 ? "" : "s"} already exist —
              anything you add here is appended.
            </p>
          ) : null}
          <form onSubmit={submitSpec} className="mt-4 space-y-3">
            <textarea
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              placeholder="e.g. 1-24 or 1-10, 12, A1"
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              aria-label="Spot numbers"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={submitting || !spec.trim()}>
                {submitting ? "Creating…" : "Create spots"}
              </Button>
              {loaded && spots.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep(2)}
                >
                  Skip to assignments
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : (
        <div className="space-y-4">
          {created !== null ? (
            <Card className="border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-800">
                {created.length > 0
                  ? `Created ${created.length} spot${
                      created.length === 1 ? "" : "s"
                    }: ${created.join(", ")}`
                  : "No new spots were created."}
                {skipped.length > 0
                  ? ` Skipped (already existed): ${skipped.join(", ")}.`
                  : null}
              </p>
            </Card>
          ) : null}

          <Card className="p-4 sm:p-6">
            <h3 className="text-base font-semibold text-slate-900">
              Assign reserved spots to management (optional)
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              A reserved spot is automatically prebooked for its owner on the
              weekdays you pick. Owners can release it for individual days.
            </p>

            {assigned.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {assigned.map((a, i) => (
                  <li key={`${a.number}-${i}`}>
                    <Badge tone="amber">
                      Spot {a.number} → {a.email}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}

            {unownedSpots.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                All spots already have an owner.
              </p>
            ) : (
              <form onSubmit={assignSpot} className="mt-4 space-y-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Spot
                  <select
                    value={spotId}
                    onChange={(e) => setSpotId(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">Pick a spot…</option>
                    {unownedSpots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.number}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Owner email
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="anna@match-trade.com"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </label>
                <fieldset>
                  <legend className="text-xs font-medium text-slate-600">
                    Prebooked weekdays
                  </legend>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((day) => {
                      const on = days.includes(day);
                      return (
                        <label
                          key={day}
                          className={cn(
                            "inline-flex cursor-pointer select-none items-center rounded-md border px-3 py-2 text-sm font-medium",
                            on
                              ? "border-brand-300 bg-brand-50 text-brand-700"
                              : "border-slate-200 bg-white text-slate-500"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={() => toggleDay(day)}
                          />
                          {weekdayShortName(day)}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <Button
                  type="submit"
                  disabled={assigning || !spotId || !ownerEmail.trim()}
                >
                  {assigning ? "Assigning…" : "Assign spot"}
                </Button>
              </form>
            )}
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => setStep(1)}>
              ← Add more spots
            </Button>
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Finish → Admin overview
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
