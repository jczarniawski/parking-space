import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireUser } from "@/lib/api-helpers";
import { getBoard } from "@/lib/services/bookings";
import { listZones } from "@/lib/services/zones";
import { getBookableDates } from "@/lib/dates";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: NextRequest) => {
  const viewer = await requireUser();
  const bookableDates = getBookableDates();
  const date = req.nextUrl.searchParams.get("date") ?? bookableDates[0];
  if (!date) throw badRequest("Missing date.");
  // Non-admins only get the current booking window — the board reveals who
  // parked where, and arbitrary dates would expose the full history to
  // every employee. Admins have that view (with audit trail) in /admin.
  if (viewer.role !== "ADMIN" && !bookableDates.includes(date)) {
    throw badRequest(
      "Only dates in the current booking window can be viewed.",
      "VIEW_WINDOW"
    );
  }
  const zoneId = req.nextUrl.searchParams.get("zone");
  const [board, zones] = await Promise.all([
    getBoard(date, viewer, zoneId),
    listZones(),
  ]);
  return NextResponse.json({ ...board, bookableDates, zones, zoneId });
});
