import Link from "next/link";
import { getOverviewStats, isSetupNeeded } from "@/lib/services/admin";
import { formatDateLong } from "@/lib/dates";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </Card>
  );
}

const quickLinks = [
  { href: "/admin/setup", label: "Add spots", hint: "Setup wizard" },
  { href: "/admin/spots", label: "Manage spots", hint: "Owners & prebooking" },
  { href: "/admin/users", label: "Manage users", hint: "Roles" },
  { href: "/admin/bookings", label: "All bookings", hint: "History & CSV" },
  { href: "/admin/audit", label: "Audit log", hint: "Everything that happened" },
];

export default async function AdminOverviewPage() {
  const [stats, setupNeeded] = await Promise.all([
    getOverviewStats(),
    isSetupNeeded(),
  ]);

  return (
    <div className="space-y-6">
      {setupNeeded ? (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            No parking spots configured yet.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Run the{" "}
            <Link
              href="/admin/setup"
              className="font-medium underline underline-offset-2"
            >
              setup wizard
            </Link>{" "}
            to add your office spots.
          </p>
        </Card>
      ) : null}

      <section>
        <h2 className="text-sm font-medium text-slate-500">
          {formatDateLong(stats.today)}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Spots total" value={stats.totalSpots} />
          <StatCard label="Active spots" value={stats.activeSpots} />
          <StatCard label="Booked today" value={stats.bookedToday} />
          <StatCard label="Releases today" value={stats.releasesToday} />
          <StatCard label="Users" value={stats.users} />
          <StatCard label="Management spots" value={stats.managementSpots} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-slate-500">Quick links</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <p className="text-sm font-medium text-brand-700">{link.label}</p>
              <p className="mt-0.5 text-sm text-slate-500">{link.hint}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
