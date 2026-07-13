import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireUser } from "@/lib/api-helpers";
import { createBooking, listMyBookings } from "@/lib/services/bookings";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const viewer = await requireUser();
  const bookings = await listMyBookings(viewer);
  return NextResponse.json({ bookings });
});

export const POST = handleApi(async (req: NextRequest) => {
  const viewer = await requireUser();
  const body = await req.json().catch(() => null);
  const spotId = typeof body?.spotId === "string" ? body.spotId : "";
  const date = typeof body?.date === "string" ? body.date : "";
  if (!spotId || !date) throw badRequest("spotId and date are required.");
  const booking = await createBooking(viewer, spotId, date);
  return NextResponse.json({ booking }, { status: 201 });
});
