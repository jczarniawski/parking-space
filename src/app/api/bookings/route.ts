import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApi, requireUser } from "@/lib/api-helpers";
import { createBooking, listMyBookings, quickBook } from "@/lib/services/bookings";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const viewer = await requireUser();
  const bookings = await listMyBookings(viewer);
  return NextResponse.json({ bookings });
});

// Two ways to book:
//   { spotId, date, vehicleId }          — a specific spot from the board
//   { zoneId?, date, vehicleId }         — quick booking, auto-assigns a
//                                          free spot (in the zone, if given)
export const POST = handleApi(async (req: NextRequest) => {
  const viewer = await requireUser();
  const body = await req.json().catch(() => null);
  const spotId = typeof body?.spotId === "string" ? body.spotId : "";
  const zoneId = typeof body?.zoneId === "string" ? body.zoneId : null;
  const date = typeof body?.date === "string" ? body.date : "";
  const vehicleId = typeof body?.vehicleId === "string" ? body.vehicleId : "";
  if (!date) throw badRequest("date is required.");

  const booking = spotId
    ? await createBooking(viewer, spotId, date, vehicleId)
    : await quickBook(viewer, date, vehicleId, zoneId);

  // Quick booking needs to tell the user which spot they got.
  const spot = await prisma.parkingSpot.findUnique({
    where: { id: booking.spotId },
    include: { zone: { select: { name: true } } },
  });
  return NextResponse.json(
    {
      booking: {
        id: booking.id,
        date: booking.date,
        spotNumber: spot?.number ?? null,
        zoneName: spot?.zone?.name ?? null,
        plate: booking.vehiclePlate,
      },
    },
    { status: 201 }
  );
});
