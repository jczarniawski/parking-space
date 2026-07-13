import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import {
  ISODate,
  RELEASE_HORIZON_DAYS,
  addDays,
  isBookableDate,
  isPrebookDay,
  isValidISODate,
  isWeekend,
  todayInOfficeTz,
} from "@/lib/dates";
import type { SessionUser } from "@/lib/api-helpers";

// ---------- Availability board ----------

export type SpotStatus = "available" | "booked" | "reserved";

export type BoardSpot = {
  spotId: string;
  number: string;
  status: SpotStatus;
  // set when status === "booked"
  bookingId?: string;
  bookedByName?: string;
  bookedByMe?: boolean;
  // management-spot info
  ownerName?: string;
  ownedByMe?: boolean;
  released?: boolean; // owner released it for this date
};

export type Board = {
  date: ISODate;
  spots: BoardSpot[];
  myBooking: { bookingId: string; spotNumber: string } | null;
  // set when the viewer owns a spot that is prebooked for them on this date
  myReservedSpot: { spotId: string; number: string; released: boolean } | null;
};

function spotNumberSort(a: { number: string }, b: { number: string }): number {
  const na = Number(a.number);
  const nb = Number(b.number);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}

export async function getBoard(date: ISODate, viewer: SessionUser): Promise<Board> {
  if (!isValidISODate(date)) throw badRequest("Invalid date.");

  const [spots, bookings, releases] = await Promise.all([
    prisma.parkingSpot.findMany({
      where: { isActive: true },
      include: { owner: { select: { id: true, name: true, email: true } } },
    }),
    prisma.booking.findMany({
      where: { date },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.spotRelease.findMany({ where: { date } }),
  ]);

  const bookingBySpot = new Map(bookings.map((b) => [b.spotId, b]));
  const releasedSpotIds = new Set(releases.map((r) => r.spotId));

  let myBooking: Board["myBooking"] = null;
  let myReservedSpot: Board["myReservedSpot"] = null;

  const boardSpots: BoardSpot[] = spots.sort(spotNumberSort).map((spot) => {
    const booking = bookingBySpot.get(spot.id);
    const released = releasedSpotIds.has(spot.id);
    const prebooked =
      !!spot.ownerId && isPrebookDay(spot.prebookDays, date) && !released;
    const ownedByMe = spot.ownerId === viewer.id;

    if (
      ownedByMe &&
      spot.ownerId &&
      isPrebookDay(spot.prebookDays, date) &&
      !isWeekend(date)
    ) {
      myReservedSpot = { spotId: spot.id, number: spot.number, released };
    }

    const base: BoardSpot = {
      spotId: spot.id,
      number: spot.number,
      status: "available",
      ownerName: spot.owner?.name ?? spot.owner?.email ?? undefined,
      ownedByMe: ownedByMe || undefined,
      released: released || undefined,
    };

    if (booking) {
      if (booking.userId === viewer.id) {
        myBooking = { bookingId: booking.id, spotNumber: spot.number };
      }
      return {
        ...base,
        status: "booked",
        bookingId: booking.id,
        bookedByName: booking.user.name ?? booking.user.email,
        bookedByMe: booking.userId === viewer.id || undefined,
      };
    }
    if (prebooked) {
      return { ...base, status: "reserved" };
    }
    return base;
  });

  return { date, spots: boardSpots, myBooking, myReservedSpot };
}

// ---------- Booking ----------

export async function createBooking(
  viewer: SessionUser,
  spotId: string,
  date: ISODate
) {
  if (!isValidISODate(date)) throw badRequest("Invalid date.");
  if (isWeekend(date)) throw badRequest("Parking can't be booked for weekends.");
  if (!isBookableDate(date)) {
    throw badRequest(
      "Spots can only be booked up to 2 business days in advance.",
      "OUTSIDE_WINDOW"
    );
  }

  const spot = await prisma.parkingSpot.findUnique({ where: { id: spotId } });
  if (!spot || !spot.isActive) throw notFound("This parking spot doesn't exist.");

  // Owners don't book their own spot — they reclaim it.
  if (spot.ownerId === viewer.id) {
    throw conflict(
      "This is your reserved spot — use “Reclaim” instead of booking it.",
      "OWN_SPOT"
    );
  }

  // If the viewer has their own prebooked (and not released) spot that day,
  // they already have parking and must release it before taking another spot.
  const ownedSpots = await prisma.parkingSpot.findMany({
    where: { ownerId: viewer.id, isActive: true },
  });
  for (const owned of ownedSpots) {
    if (isPrebookDay(owned.prebookDays, date)) {
      const released = await prisma.spotRelease.findUnique({
        where: { spotId_date: { spotId: owned.id, date } },
      });
      if (!released) {
        throw conflict(
          `You already have your reserved spot ${owned.number} that day. Release it first if you want a different one.`,
          "HAS_RESERVED_SPOT"
        );
      }
    }
  }

  try {
    const booking = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: a management spot is only bookable
      // on its prebook days if the owner's release is still in place.
      const freshSpot = await tx.parkingSpot.findUnique({ where: { id: spotId } });
      if (!freshSpot || !freshSpot.isActive) {
        throw notFound("This parking spot doesn't exist.");
      }
      if (freshSpot.ownerId && isPrebookDay(freshSpot.prebookDays, date)) {
        const release = await tx.spotRelease.findUnique({
          where: { spotId_date: { spotId, date } },
        });
        if (!release) {
          throw conflict(
            `Spot ${freshSpot.number} is reserved for a management member that day.`,
            "SPOT_RESERVED"
          );
        }
      }
      return tx.booking.create({
        data: { spotId, userId: viewer.id, date },
      });
    });

    await logAudit({
      action: "BOOKING_CREATED",
      actorEmail: viewer.email,
      spotNumber: spot.number,
      date,
    });
    return booking;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String(err.meta?.target ?? "");
      if (target.includes("userId")) {
        throw conflict(
          "You already have a spot booked for that day.",
          "ALREADY_BOOKED_THAT_DAY"
        );
      }
      throw conflict(
        "Someone just booked that spot. Pick another one.",
        "SPOT_TAKEN"
      );
    }
    throw err;
  }
}

export async function cancelBooking(viewer: SessionUser, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      spot: { select: { number: true } },
      user: { select: { email: true } },
    },
  });
  if (!booking) throw notFound("Booking not found.");

  const isOwn = booking.userId === viewer.id;
  if (!isOwn && viewer.role !== "ADMIN") {
    throw forbidden("You can only cancel your own bookings.");
  }

  const today = todayInOfficeTz();
  if (booking.date < today) {
    throw badRequest("Past bookings can't be cancelled.");
  }

  await prisma.booking.delete({ where: { id: bookingId } });
  await logAudit({
    action: "BOOKING_CANCELLED",
    actorEmail: viewer.email,
    targetEmail: isOwn ? null : booking.user.email,
    spotNumber: booking.spot.number,
    date: booking.date,
    details: isOwn ? null : "Cancelled by admin",
  });
}

export async function listMyBookings(viewer: SessionUser) {
  const today = todayInOfficeTz();
  const bookings = await prisma.booking.findMany({
    where: { userId: viewer.id },
    include: { spot: { select: { number: true } } },
    orderBy: { date: "desc" },
    take: 200,
  });
  return bookings.map((b) => ({
    id: b.id,
    date: b.date,
    spotNumber: b.spot.number,
    isPast: b.date < today,
    canCancel: b.date >= today,
  }));
}

// ---------- Management release / reclaim ----------

async function findOwnedSpotOrThrow(viewer: SessionUser) {
  const spot = await prisma.parkingSpot.findFirst({
    where: { ownerId: viewer.id, isActive: true },
  });
  if (!spot) throw forbidden("You don't have a reserved spot.");
  return spot;
}

export async function releaseSpot(viewer: SessionUser, date: ISODate) {
  if (!isValidISODate(date)) throw badRequest("Invalid date.");
  const spot = await findOwnedSpotOrThrow(viewer);

  const today = todayInOfficeTz();
  if (date < today) throw badRequest("You can't release a spot for a past day.");
  if (date > addDays(today, RELEASE_HORIZON_DAYS)) {
    throw badRequest(
      `Releases can be made at most ${RELEASE_HORIZON_DAYS} days in advance.`
    );
  }
  if (isWeekend(date)) throw badRequest("Weekends aren't working days.");
  if (!isPrebookDay(spot.prebookDays, date)) {
    throw badRequest("Your spot isn't prebooked for you on that day.");
  }

  try {
    const release = await prisma.spotRelease.create({
      data: { spotId: spot.id, date, releasedById: viewer.id },
    });
    await logAudit({
      action: "SPOT_RELEASED",
      actorEmail: viewer.email,
      spotNumber: spot.number,
      date,
    });
    return release;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("You already released your spot for that day.");
    }
    throw err;
  }
}

export async function reclaimSpot(viewer: SessionUser, date: ISODate) {
  if (!isValidISODate(date)) throw badRequest("Invalid date.");
  const spot = await findOwnedSpotOrThrow(viewer);

  const today = todayInOfficeTz();
  if (date < today) throw badRequest("You can't reclaim a spot for a past day.");

  await prisma.$transaction(async (tx) => {
    const release = await tx.spotRelease.findUnique({
      where: { spotId_date: { spotId: spot.id, date } },
    });
    if (!release) throw notFound("Your spot isn't released for that day.");

    const booking = await tx.booking.findUnique({
      where: { spotId_date: { spotId: spot.id, date } },
      include: { user: { select: { name: true, email: true } } },
    });
    if (booking) {
      throw conflict(
        `${booking.user.name ?? booking.user.email} has already booked your spot for that day.`,
        "SPOT_ALREADY_BOOKED"
      );
    }
    await tx.spotRelease.delete({ where: { id: release.id } });
  });

  await logAudit({
    action: "SPOT_RECLAIMED",
    actorEmail: viewer.email,
    spotNumber: spot.number,
    date,
  });
}

/** Upcoming releases for the viewer's own spot (management view). */
export async function listMyReleases(viewer: SessionUser) {
  const spot = await prisma.parkingSpot.findFirst({
    where: { ownerId: viewer.id, isActive: true },
  });
  if (!spot) return { spot: null, releases: [] };

  const today = todayInOfficeTz();
  const releases = await prisma.spotRelease.findMany({
    where: { spotId: spot.id, date: { gte: today } },
    orderBy: { date: "asc" },
  });
  const bookings = await prisma.booking.findMany({
    where: { spotId: spot.id, date: { in: releases.map((r) => r.date) } },
    include: { user: { select: { name: true, email: true } } },
  });
  const bookingByDate = new Map(bookings.map((b) => [b.date, b]));

  return {
    spot: { id: spot.id, number: spot.number, prebookDays: spot.prebookDays },
    releases: releases.map((r) => ({
      id: r.id,
      date: r.date,
      bookedBy: bookingByDate.get(r.date)
        ? (bookingByDate.get(r.date)!.user.name ??
          bookingByDate.get(r.date)!.user.email)
        : null,
    })),
  };
}
