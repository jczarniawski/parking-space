"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Card,
  EmptyState,
  Spinner,
  apiFetch,
} from "@/components/ui";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string; // EMPLOYEE | MANAGEMENT | ADMIN
  ownedSpotNumbers: string[];
  totalBookings: number;
  upcomingBookings: number;
  createdAt: string;
};

const ROLES = ["EMPLOYEE", "MANAGEMENT", "ADMIN"] as const;

const roleTone: Record<string, "slate" | "amber" | "purple"> = {
  EMPLOYEE: "slate",
  MANAGEMENT: "amber",
  ADMIN: "purple",
};

export function UsersManager() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 8000);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: AdminUser[] }>("/api/admin/users");
      setUsers(data.users);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load users.");
      setUsers((prev) => prev ?? []);
    }
  }, [showError]);

  useEffect(() => {
    void load();
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, [load]);

  async function changeRole(user: AdminUser, role: string) {
    if (role === user.role) return;
    setBusyId(user.id);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Role change failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (users === null) {
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

      {users.length === 0 ? (
        <Card>
          <EmptyState
            title="No users yet"
            hint="Users appear after their first sign-in."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {users.map((user) => (
            <li key={user.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.image}
                      alt=""
                      className="h-9 w-9 rounded-full"
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                      {(user.name ?? user.email).charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {user.name ?? user.email}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {user.email}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Badge tone={roleTone[user.role] ?? "slate"}>
                      {user.role}
                    </Badge>
                    <select
                      value={user.role}
                      disabled={busyId === user.id}
                      onChange={(e) => void changeRole(user, e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
                      aria-label={`Role for ${user.email}`}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>
                    Bookings: {user.totalBookings} total,{" "}
                    {user.upcomingBookings} upcoming
                  </span>
                  {user.ownedSpotNumbers.length > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      Reserved spot:
                      {user.ownedSpotNumbers.map((n) => (
                        <Badge key={n} tone="amber">
                          {n}
                        </Badge>
                      ))}
                    </span>
                  ) : null}
                  <span>
                    Joined{" "}
                    {new Date(user.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
