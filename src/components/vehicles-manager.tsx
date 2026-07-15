"use client";

// Vehicles manager (Profile page): the user's saved registration plates.
// Rows with a car icon + delete (inline confirm), and an add-plate form.
// Booking flows require one of these plates, so this is the single place
// they are managed.

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button, Spinner, apiFetch, cn } from "@/components/ui";

type Vehicle = { id: string; plate: string };

const MAX_VEHICLES = 5;

// ---------- Icons (inline, no icon library) ----------

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

function TrashIcon({ className }: { className?: string }) {
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
      <path d="M4.5 6.5h15" />
      <path d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5" />
      <path d="M6.5 6.5 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

// ---------- Manager ----------

export function VehiclesManager() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ vehicles: Vehicle[] }>("/api/vehicles");
      setVehicles(data.vehicles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addPlate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plate.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/vehicles", {
        method: "POST",
        body: JSON.stringify({ plate }),
      });
      setPlate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function removeVehicle(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/vehicles/${id}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setConfirmId(null);
      setBusy(false);
      await load();
    }
  }

  const atLimit = (vehicles?.length ?? 0) >= MAX_VEHICLES;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-4">
        <h2 className="text-sm font-semibold text-slate-800">My vehicles</h2>
        <p className="text-xs text-slate-400">
          Up to {MAX_VEHICLES} plates
        </p>
      </div>
      <p className="px-4 pt-0.5 text-xs text-slate-500">
        Every booking is tied to one of your saved plates.
      </p>

      {error ? (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {(vehicles ?? []).map((vehicle) => (
            <li key={vehicle.id} className="px-4">
              <div className="flex min-h-[52px] items-center gap-3 py-1.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <CarIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-wide text-slate-800">
                  {vehicle.plate}
                </span>
                <button
                  type="button"
                  aria-label={`Remove plate ${vehicle.plate}`}
                  disabled={busy}
                  onClick={() =>
                    setConfirmId((cur) => (cur === vehicle.id ? null : vehicle.id))
                  }
                  className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
              {confirmId === vehicle.id ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                  <p className="text-sm font-medium text-red-700">
                    Remove {vehicle.plate}?
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() => void removeVehicle(vehicle.id)}
                    >
                      {busy ? "Removing…" : "Remove"}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirmId(null)}
                    >
                      Keep
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
          {vehicles && vehicles.length === 0 ? (
            <li className="px-4 py-5 text-center text-sm text-slate-400">
              No plates yet — add your car below to start booking.
            </li>
          ) : null}
        </ul>
      )}

      <form
        onSubmit={addPlate}
        className={cn(
          "flex gap-2 border-t border-slate-100 p-4",
          loading && "opacity-50"
        )}
      >
        <input
          type="text"
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          maxLength={12}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="e.g. PY 1075E"
          aria-label="Registration plate"
          disabled={busy || loading || atLimit}
          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium uppercase tracking-wide text-slate-800 placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50"
        />
        <Button
          type="submit"
          disabled={busy || loading || atLimit || !plate.trim()}
          className="h-11 shrink-0 rounded-xl"
        >
          <PlusIcon className="h-4 w-4" />
          {busy ? "Adding…" : "Add"}
        </Button>
      </form>
      {atLimit ? (
        <p className="px-4 pb-4 -mt-2 text-xs text-slate-400">
          Plate limit reached — remove one to add another.
        </p>
      ) : null}
    </section>
  );
}
