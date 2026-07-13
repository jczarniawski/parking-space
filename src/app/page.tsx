import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSetupNeeded } from "@/lib/services/admin";
import { BookingBoard } from "@/components/booking-board";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Book a spot" };

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (await isSetupNeeded()) {
    if (session.user.role === "ADMIN") redirect("/admin/setup");
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">Book a spot</h1>
        <Card>
          <EmptyState
            title="Parking hasn't been configured yet"
            hint="An administrator needs to add the parking spots first — check back soon."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Book a spot</h1>
      <BookingBoard role={session.user.role} />
    </div>
  );
}
