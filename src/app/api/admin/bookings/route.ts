import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireAdmin } from "@/lib/api-helpers";
import { bookingsToCsv, listAllBookings } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: NextRequest) => {
  await requireAdmin();
  const sp = req.nextUrl.searchParams;
  const filters = {
    userId: sp.get("userId") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  };
  const isCsv = sp.get("format") === "csv";
  // The CSV is the "give me everything" export, so it gets a far higher cap
  // than the on-screen table.
  const { bookings, total } = await listAllBookings(filters, isCsv ? 100000 : 2000);

  if (isCsv) {
    return new NextResponse(bookingsToCsv(bookings), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="parking-bookings.csv"`,
      },
    });
  }
  return NextResponse.json({ bookings, total });
});
