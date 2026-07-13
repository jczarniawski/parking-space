import Link from "next/link";
import { SpotsManager } from "@/components/admin/spots-manager";

export const dynamic = "force-dynamic";

export default function AdminSpotsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Parking spots</h2>
        <Link
          href="/admin/setup"
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Setup wizard →
        </Link>
      </div>
      <SpotsManager />
    </div>
  );
}
