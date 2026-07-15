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
  zone: { id: string; name: string } | null;
  owner: { id: string; name: string | null; email: string } | null;
};

type Zone = { id: string; name: string; spotCount: number };

const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_WEEKDAYS = [1, 2, 3, 4, 5];

const STEPS: { n: 1 | 2 | 3; label: string }[] = [
  { n: 1, label: "Zones" },
  { n: 2, label: "Spots" },
  { n: 3, label: "Management" },
];

export function SetupWizard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [spots, setSpots] = useState<AdminSpot[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 (zones) state — prefilled suggestions the admin can edit or add.
  const [zoneDrafts, setZoneDrafts] = useState<string[]>([
    "Underground",
    "Ground level",
  ]);
  const [addingZoneIdx, setAddingZoneIdx] = useState<number | null>(null);
  const [deletingZoneId, setDeletingZoneId] = useState<string | null>(null);

  // Step 2 (spots) state
  const [spec, setSpec] = useState("");
  const [specZoneId, setSpecZoneId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rounds, setRounds] = useState<string[]>([]);

  // Step 3 (management) state
  const [spotId, setSpotId] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [days, setDays] = useState<number[]>(ALL_WEEKDAYS);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState<
    { number: string; email: string }[]
  >([]);

  const loadZones = useCallback(async () => {
    try {
      const data = await apiFetch<{ zones: Zone[] }>("/api/admin/zones");
      setZones(data.zones);
      setSpecZoneId((prev) =>
        prev && data.zones.some((z) => z.id === prev)
          ? prev
          : (data.zones[0]?.id ?? "")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load zones.");
    }
  }, []);

  const loadSpots = useCallback(async () => {
    try {
      const data = await apiFetch<{ spots: AdminSpot[] }>("/api/admin/spots");
      setSpots(data.spots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spots.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadZones();
    void loadSpots();
  }, [loadZones, loadSpots]);

  async function addZone(idx: number) {
    const name = (zoneDrafts[idx] ?? "").trim();
    if (!name) return;
    setAddingZoneIdx(idx);
    setError(null);
    try {
      await apiFetch("/api/admin/zones", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setZoneDrafts((prev) => prev.filter((_, i) => i !== idx));
      await loadZones();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creating the zone failed.");
    } finally {
      setAddingZoneIdx(null);
    }
  }

  async function removeZone(zone: Zone) {
    setDeletingZoneId(zone.id);
    setError(null);
    try {
      await apiFetch(`/api/admin/zones/${zone.id}`, { method: "DELETE" });
      await loadZones();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deleting the zone failed.");
    } finally {
      setDeletingZoneId(null);
    }
  }

  async function submitSpec(e: React.FormEvent) {
    e.preventDefault();
    if (!spec.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch<{ created: string[]; skipped: string[] }>(
        "/api/admin/spots",
        {
          method: "POST",
          body: JSON.stringify({ spec, zoneId: specZoneId || null }),
        }
      );
      const zoneName = zones.find((z) => z.id === specZoneId)?.name ?? "No zone";
      const parts: string[] = [];
      parts.push(
        data.created.length > 0
          ? `Created ${data.created.length} in ${zoneName}: ${data.created.join(", ")}`
          : "Nothing new to create"
      );
      if (data.skipped.length > 0) {
        parts.push(`already existed: ${data.skipped.join(", ")}`);
      }
      setRounds((prev) => [...prev, parts.join(" — ")]);
      setSpec("");
      await Promise.all([loadSpots(), loadZones()]);
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
        {STEPS.map((s, i) => (
          <span key={s.n} className="flex items-center gap-2">
            {i > 0 ? <span className="text-slate-300">—</span> : null}
            <span
              className={cn(
                "rounded-full px-2.5 py-1",
                step === s.n
                  ? "bg-brand-600 text-white"
                  : step > s.n
                    ? "bg-brand-100 text-brand-700"
                    : "bg-slate-100 text-slate-500"
              )}
            >
              {s.n} · {s.label}
            </span>
          </span>
        ))}
      </div>

      {step === 1 ? (
        <Card className="p-4 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">
            Does the parking have zones?
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Zones group spots (e.g. an underground garage vs. the outside lot).
            Employees pick a zone when booking. Skip this if all spots live in
            one place.
          </p>

          {zones.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {zones.map((zone) => (
                <li
                  key={zone.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-slate-800">
                    {zone.name}
                  </span>
                  <Badge tone="slate">
                    {zone.spotCount} spot{zone.spotCount === 1 ? "" : "s"}
                  </Badge>
                  {zone.spotCount === 0 ? (
                    <Button
                      variant="ghost"
                      className="ml-auto text-red-600 hover:bg-red-50"
                      disabled={deletingZoneId === zone.id}
                      onClick={() => void removeZone(zone)}
                    >
                      {deletingZoneId === zone.id ? "Deleting…" : "Delete"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 space-y-2">
            {zoneDrafts.map((draft, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) =>
                    setZoneDrafts((prev) =>
                      prev.map((d, i) => (i === idx ? e.target.value : d))
                    )
                  }
                  placeholder="Zone name"
                  maxLength={40}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  aria-label={`Zone name suggestion ${idx + 1}`}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={addingZoneIdx !== null || !draft.trim()}
                  onClick={() => void addZone(idx)}
                >
                  {addingZoneIdx === idx ? "Adding…" : "Add"}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setZoneDrafts((prev) => [...prev, ""])}
            >
              + Another zone
            </Button>
          </div>

          <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
            <Button type="button" onClick={() => setStep(2)}>
              Next: spots →
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="p-4 sm:p-6">
          <h3 className="text-base font-semibold text-slate-900">
            Which spot numbers does the office have?
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Enter numbers, ranges or labels separated by commas. Repeat per
            zone — e.g. add 1–10 to Underground, then 11–20 to Ground level.
          </p>
          {loaded && spots.length > 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              {spots.length} spot{spots.length === 1 ? "" : "s"} already exist —
              anything you add here is appended.
            </p>
          ) : null}

          {rounds.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {rounds.map((r, i) => (
                <li key={i} className="text-sm text-emerald-700">
                  {r}
                </li>
              ))}
            </ul>
          ) : null}

          <form onSubmit={submitSpec} className="mt-4 space-y-3">
            <textarea
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              placeholder="e.g. 1-24 or 1-10, 12, A1"
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              aria-label="Spot numbers"
            />
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Zone
              <select
                value={specZoneId}
                onChange={(e) => setSpecZoneId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {zones.length === 0 ? (
                  <option value="">No zone</option>
                ) : (
                  zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <Button type="submit" disabled={submitting || !spec.trim()}>
              {submitting ? "Creating…" : "Create spots"}
            </Button>
          </form>

          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              ← Zones
            </Button>
            <Button
              type="button"
              disabled={spots.length === 0}
              onClick={() => setStep(3)}
            >
              Next: management →
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
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
                        {s.zone ? ` · ${s.zone.name}` : ""}
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
            <Button variant="secondary" onClick={() => setStep(2)}>
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
      ) : null}
    </div>
  );
}
