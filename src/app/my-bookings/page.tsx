import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MyBookingsList } from "@/components/my-bookings-list";
import { ReleasesPanel } from "@/components/releases-panel";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My bookings" };

export default async function MyBookingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const t = await getT();

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">{t("myb.title")}</h1>
      {/* Renders nothing for users without a reserved spot. */}
      <ReleasesPanel />
      <MyBookingsList />
    </div>
  );
}
