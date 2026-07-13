import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireAdmin } from "@/lib/api-helpers";
import { bookingsToCsv, listAllBookings } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: NextRequest) => {
  await requireAdmin();
  const sp = req.nextUrl.searchParams;
  const rows = await listAllBookings({
    userId: sp.get("userId") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });

  if (sp.get("format") === "csv") {
    return new NextResponse(bookingsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="parking-bookings.csv"`,
      },
    });
  }
  return NextResponse.json({ bookings: rows });
});
