import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BookingBoard } from "@/components/booking-board";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Parking board" };

export default async function BoardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const t = await getT();

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{t("board.title")}</h1>
      <BookingBoard role={session.user.role} />
    </div>
  );
}
