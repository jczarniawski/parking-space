"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateHuman } from "@/lib/dates";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Spinner,
  apiFetch,
} from "@/components/ui";

type AuditEntry = {
  id: string;
  action: string;
  actorEmail: string | null;
  targetEmail: string | null;
  spotNumber: string | null;
  date: string | null;
  details: string | null;
  createdAt: string;
};

type BadgeTone = "green" | "red" | "amber" | "blue" | "slate" | "purple";

const actionMeta: Record<string, { label: string; tone: BadgeTone }> = {
  BOOKING_CREATED: { label: "Booking created", tone: "green" },
  BOOKING_CANCELLED: { label: "Booking cancelled", tone: "red" },
  SPOT_RELEASED: { label: "Spot released", tone: "amber" },
  SPOT_RECLAIMED: { label: "Spot reclaimed", tone: "amber" },
  SPOTS_CREATED: { label: "Spots created", tone: "blue" },
  SPOT_UPDATED: { label: "Spot updated", tone: "blue" },
  SPOT_DELETED: { label: "Spot deleted", tone: "red" },
  ROLE_CHANGED: { label: "Role changed", tone: "purple" },
  USER_PREPROVISIONED: { label: "User pre-provisioned", tone: "purple" },
};

const PAGE = 100;

export function AuditList() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 8000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ entries: AuditEntry[] }>(`/api/admin/audit?limit=${limit}`)
      .then((data) => {
        if (!cancelled) setEntries(data.entries);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          showError(
            err instanceof Error ? err.message : "Failed to load the audit log."
          );
          setEntries((prev) => prev ?? []);
        }
      });
    return () => {
      cancelled = true;
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, [limit, showError]);

  if (entries === null) {
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

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing logged yet"
            hint="Bookings, releases and admin changes show up here."
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const meta = actionMeta[entry.action] ?? {
                label: entry.action,
                tone: "slate" as BadgeTone,
              };
              return (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {entry.spotNumber ? (
                      <span className="text-sm font-medium text-slate-900">
                        Spot {entry.spotNumber}
                      </span>
                    ) : null}
                    {entry.date ? (
                      <span className="text-sm text-slate-600">
                        for {formatDateHuman(entry.date)}
                      </span>
                    ) : null}
                    <span className="ml-auto whitespace-nowrap text-xs text-slate-400">
                      {new Date(entry.createdAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {entry.actorEmail ? <>by {entry.actorEmail}</> : "by system"}
                    {entry.targetEmail ? <> · affects {entry.targetEmail}</> : null}
                    {entry.details ? <> · {entry.details}</> : null}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {entries.length >= limit ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => setLimit((l) => Math.min(l + PAGE, 1000))}
            disabled={limit >= 1000}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
