"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateHuman } from "@/lib/dates";
import {
  Badge,
  Card,
  EmptyState,
  Spinner,
  apiFetch,
} from "@/components/ui";

type AdminBooking = {
  id: string;
  date: string;
  spotNumber: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
  isPast: boolean;
};

type UserOption = {
  id: string;
  email: string;
  name: string | null;
};

function buildQuery(filters: {
  userId: string;
  from: string;
  to: string;
}): string {
  const params = new URLSearchParams();
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return params.toString();
}

export function BookingsTable() {
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 8000);
  }, []);

  useEffect(() => {
    apiFetch<{ users: UserOption[] }>("/api/admin/users")
      .then((data) => setUsers(data.users))
      .catch((err: unknown) =>
        showError(
          err instanceof Error ? err.message : "Failed to load employees."
        )
      );
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, [showError]);

  const query = useMemo(
    () => buildQuery({ userId, from, to }),
    [userId, from, to]
  );

  useEffect(() => {
    let cancelled = false;
    setBookings(null);
    apiFetch<{ bookings: AdminBooking[] }>(
      `/api/admin/bookings${query ? `?${query}` : ""}`
    )
      .then((data) => {
        if (!cancelled) setBookings(data.bookings);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          showError(
            err instanceof Error ? err.message : "Failed to load bookings."
          );
          setBookings([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query, showError]);

  const csvHref = `/api/admin/bookings?${query ? `${query}&` : ""}format=csv`;

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
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Employee
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All employees</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <a
            href={csvHref}
            download
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 sm:ml-auto"
          >
            Export CSV
          </a>
        </div>
      </Card>

      {bookings === null ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : bookings.length === 0 ? (
        <Card>
          <EmptyState
            title="No bookings found"
            hint="Try widening the filters."
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Spot</th>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Booked at</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-900">
                    {formatDateHuman(b.date)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {b.spotNumber}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-900">{b.userName}</p>
                    <p className="text-xs text-slate-500">{b.userEmail}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {new Date(b.createdAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {b.isPast ? (
                      <Badge tone="slate">Past</Badge>
                    ) : (
                      <Badge tone="green">Upcoming</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
