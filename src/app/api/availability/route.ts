import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireUser } from "@/lib/api-helpers";
import { getBoard } from "@/lib/services/bookings";
import { getBookableDates } from "@/lib/dates";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: NextRequest) => {
  const viewer = await requireUser();
  const bookableDates = getBookableDates();
  const date = req.nextUrl.searchParams.get("date") ?? bookableDates[0];
  if (!date) throw badRequest("Missing date.");
  const board = await getBoard(date, viewer);
  return NextResponse.json({ ...board, bookableDates });
});
