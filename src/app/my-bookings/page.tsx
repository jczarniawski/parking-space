import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MyBookingsList } from "@/components/my-bookings-list";
import { ReleasesPanel } from "@/components/releases-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My bookings" };

export default async function MyBookingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My bookings</h1>
      {/* Renders nothing for users without a reserved spot. */}
      <ReleasesPanel />
      <MyBookingsList />
    </div>
  );
}
