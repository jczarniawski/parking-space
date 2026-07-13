import { BookingsTable } from "@/components/admin/bookings-table";

export const dynamic = "force-dynamic";

export default function AdminBookingsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">All bookings</h2>
      <BookingsTable />
    </div>
  );
}
