"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parsePrebookDays, weekdayShortName } from "@/lib/dates";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Spinner,
  apiFetch,
  cn,
} from "@/components/ui";

type AdminSpot = {
  id: string;
  number: string;
  isActive: boolean;
  prebookDays: string; // comma-separated ISO weekdays, e.g. "1,2,3,4,5"
  owner: { id: string; name: string | null; email: string } | null;
};

const WEEKDAYS = [1, 2, 3, 4, 5];

export function SpotsManager() {
  const [spots, setSpots] = useState<AdminSpot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [spec, setSpec] = useState("");
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<string | null>(null);
  const [ownerDrafts, setOwnerDrafts] = useState<Record<string, string>>({});
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 8000);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ spots: AdminSpot[] }>("/api/admin/spots");
      setSpots(data.spots);
      setOwnerDrafts(
        Object.fromEntries(
          data.spots.map((s): [string, string] => [s.id, s.owner?.email ?? ""])
        )
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load spots.");
      setSpots((prev) => prev ?? []);
    }
  }, [showError]);

  useEffect(() => {
    void load();
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, [load]);

  async function patchSpot(
    spotId: string,
    body: {
      isActive?: boolean;
      prebookDays?: number[];
      ownerEmail?: string | null;
    }
  ) {
    setBusyId(spotId);
    try {
      await apiFetch(`/api/admin/spots/${spotId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteSpot(spot: AdminSpot) {
    if (
      !window.confirm(
        `Delete spot ${spot.number}? Spots with booking history can't be deleted — deactivate those instead.`
      )
    ) {
      return;
    }
    setBusyId(spot.id);
    try {
      await apiFetch(`/api/admin/spots/${spot.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function addSpots(e: React.FormEvent) {
    e.preventDefault();
    if (!spec.trim()) return;
    setAdding(true);
    setAddResult(null);
    try {
      const data = await apiFetch<{ created: string[]; skipped: string[] }>(
        "/api/admin/spots",
        { method: "POST", body: JSON.stringify({ spec }) }
      );
      const parts: string[] = [];
      parts.push(
        data.created.length > 0
          ? `Created ${data.created.length}: ${data.created.join(", ")}`
          : "Nothing new to create"
      );
      if (data.skipped.length > 0) {
        parts.push(`already existed: ${data.skipped.join(", ")}`);
      }
      setAddResult(parts.join(" — "));
      setSpec("");
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Adding spots failed.");
    } finally {
      setAdding(false);
    }
  }

  function toggleWeekday(spot: AdminSpot, day: number) {
    const current = parsePrebookDays(spot.prebookDays);
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort();
    if (next.length === 0) {
      showError("Pick at least one weekday (Mon–Fri) for prebooking.");
      return;
    }
    void patchSpot(spot.id, { prebookDays: next });
  }

  function saveOwner(spot: AdminSpot) {
    const email = (ownerDrafts[spot.id] ?? "").trim();
    void patchSpot(spot.id, { ownerEmail: email === "" ? null : email });
  }

  if (spots === null) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

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

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-900">Add spots</h3>
        <form
          onSubmit={addSpots}
          className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start"
        >
          <input
            type="text"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="e.g. 1-24 or 1-10, 12, A1"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            aria-label="Spot numbers to add"
          />
          <Button type="submit" disabled={adding || !spec.trim()}>
            {adding ? "Adding…" : "Add"}
          </Button>
        </form>
        {addResult ? (
          <p className="mt-2 text-sm text-emerald-700">{addResult}</p>
        ) : null}
      </Card>

      {spots.length === 0 ? (
        <Card>
          <EmptyState
            title="No spots yet"
            hint="Add spot numbers above or use the setup wizard."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {spots.map((spot) => {
            const busy = busyId === spot.id;
            const days = parsePrebookDays(spot.prebookDays);
            const ownerDraft = ownerDrafts[spot.id] ?? "";
            const ownerDirty = ownerDraft.trim() !== (spot.owner?.email ?? "");
            return (
              <li key={spot.id}>
                <Card className={cn("p-4", !spot.isActive && "opacity-70")}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-lg font-semibold text-slate-900">
                      {spot.number}
                    </span>
                    {spot.isActive ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="slate">Inactive</Badge>
                    )}
                    {spot.owner ? (
                      <Badge tone="amber">
                        Reserved · {spot.owner.name ?? spot.owner.email}
                      </Badge>
                    ) : null}
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void patchSpot(spot.id, { isActive: !spot.isActive })
                        }
                      >
                        {spot.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() => void deleteSpot(spot)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
                    <div className="flex w-full items-center gap-2 sm:max-w-sm">
                      <input
                        type="email"
                        value={ownerDraft}
                        onChange={(e) =>
                          setOwnerDrafts((prev) => ({
                            ...prev,
                            [spot.id]: e.target.value,
                          }))
                        }
                        placeholder="Owner email (blank = unassigned)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        aria-label={`Owner email for spot ${spot.number}`}
                      />
                      <Button
                        variant="secondary"
                        disabled={busy || !ownerDirty}
                        onClick={() => saveOwner(spot)}
                      >
                        Save
                      </Button>
                    </div>

                    {spot.owner ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-slate-500">Prebooked:</span>
                        {WEEKDAYS.map((day) => {
                          const on = days.includes(day);
                          return (
                            <label
                              key={day}
                              className={cn(
                                "inline-flex cursor-pointer select-none items-center rounded-md border px-2 py-1.5 text-xs font-medium",
                                on
                                  ? "border-brand-300 bg-brand-50 text-brand-700"
                                  : "border-slate-200 bg-white text-slate-500",
                                busy && "cursor-not-allowed opacity-60"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={on}
                                disabled={busy}
                                onChange={() => toggleWeekday(spot, day)}
                              />
                              {weekdayShortName(day)}
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
