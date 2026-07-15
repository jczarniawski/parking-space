import { Prisma } from "@prisma/client";
import { prisma, serializableTx } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { ApiError, badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import {
  ISODate,
  RELEASE_HORIZON_DAYS,
  addDays,
  compareDates,
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
  // set when the viewer owns a spot that is prebooked for them on this date;
  // bookedBy is the colleague who booked it after a release (blocks reclaim)
  myReservedSpot: {
    spotId: string;
    number: string;
    released: boolean;
    bookedBy: string | null;
  } | null;
};

function spotNumberSort(a: { number: string }, b: { number: string }): number {
  const na = Number(a.number);
  const nb = Number(b.number);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}

export async function getBoard(
  date: ISODate,
  viewer: SessionUser,
  zoneId?: string | null
): Promise<Board> {
  if (!isValidISODate(date)) throw badRequest("Invalid date.");

  const [spots, bookings, releases] = await Promise.all([
    prisma.parkingSpot.findMany({
      where: { isActive: true, ...(zoneId ? { zoneId } : {}) },
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
      myReservedSpot = {
        spotId: spot.id,
        number: spot.number,
        released,
        bookedBy: booking ? (booking.user.name ?? booking.user.email) : null,
      };
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

  // The zone filter must not hide the viewer's own state: their booking or
  // reserved spot may live in a different zone than the one being viewed
  // (otherwise the banner disappears and the client re-enables booking).
  if (!myBooking) {
    const own = await prisma.booking.findUnique({
      where: { userId_date: { userId: viewer.id, date } },
      include: { spot: { select: { number: true } } },
    });
    if (own) myBooking = { bookingId: own.id, spotNumber: own.spot.number };
  }
  if (!myReservedSpot && !isWeekend(date)) {
    const owned = await prisma.parkingSpot.findFirst({
      where: { ownerId: viewer.id, isActive: true },
    });
    if (owned && isPrebookDay(owned.prebookDays, date)) {
      const [rel, bk] = await Promise.all([
        prisma.spotRelease.findUnique({
          where: { spotId_date: { spotId: owned.id, date } },
        }),
        prisma.booking.findUnique({
          where: { spotId_date: { spotId: owned.id, date } },
          include: { user: { select: { name: true, email: true } } },
        }),
      ]);
      myReservedSpot = {
        spotId: owned.id,
        number: owned.number,
        released: !!rel,
        bookedBy: bk ? (bk.user.name ?? bk.user.email) : null,
      };
    }
  }

  return { date, spots: boardSpots, myBooking, myReservedSpot };
}

// ---------- Booking ----------

async function requireOwnVehicleForBooking(viewer: SessionUser, vehicleId: string) {
  if (!vehicleId) {
    throw badRequest("Pick which car you'll park.", "VEHICLE_REQUIRED");
  }
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.userId !== viewer.id) {
    throw badRequest("Pick one of your saved vehicles.", "VEHICLE_REQUIRED");
  }
  return vehicle;
}

export async function createBooking(
  viewer: SessionUser,
  spotId: string,
  date: ISODate,
  vehicleId: string
) {
  if (!isValidISODate(date)) throw badRequest("Invalid date.");
  if (isWeekend(date)) throw badRequest("Parking can't be booked for weekends.");
  if (!isBookableDate(date)) {
    throw badRequest(
      "Spots can only be booked up to 2 business days in advance.",
      "OUTSIDE_WINDOW"
    );
  }

  const vehicle = await requireOwnVehicleForBooking(viewer, vehicleId);

  const spot = await prisma.parkingSpot.findUnique({ where: { id: spotId } });
  if (!spot || !spot.isActive) throw notFound("This parking spot doesn't exist.");

  // On prebook days the owner's spot is either still theirs (nothing to book)
  // or released (they reclaim instead of booking). On other weekdays the
  // owner books their own spot like any other free spot.
  if (spot.ownerId === viewer.id && isPrebookDay(spot.prebookDays, date)) {
    const released = await prisma.spotRelease.findUnique({
      where: { spotId_date: { spotId, date } },
    });
    throw conflict(
      released
        ? "This is your reserved spot — use “Reclaim” instead of booking it."
        : "This spot is already reserved for you that day.",
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
    // Serializable: the release read must still hold when the booking row is
    // written, otherwise a concurrent reclaim could delete the release while
    // this booking commits (write-skew on READ COMMITTED).
    const booking = await serializableTx(async (tx) => {
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
        data: {
          spotId,
          userId: viewer.id,
          date,
          vehicleId: vehicle.id,
          vehiclePlate: vehicle.plate,
        },
      });
    });

    await logAudit({
      action: "BOOKING_CREATED",
      actorEmail: viewer.email,
      spotNumber: spot.number,
      date,
      details: vehicle.plate,
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
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw conflict("The parking board is busy — please try again.");
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      // The chosen vehicle was deleted between validation and the insert.
      throw badRequest("That vehicle was just removed — pick another.", "VEHICLE_REQUIRED");
    }
    throw err;
  }
}

/**
 * Quick booking: auto-assign the lowest-numbered free spot in a zone.
 * Candidates are checked optimistically; createBooking re-validates each one
 * atomically, so losing a race to a colleague just moves on to the next spot.
 */
export async function quickBook(
  viewer: SessionUser,
  date: ISODate,
  vehicleId: string,
  zoneId?: string | null
) {
  // Validate everything up-front, before touching occupancy data — otherwise
  // the ZONE_FULL/window error ordering would let anyone probe historical
  // occupancy, and a missing vehicle would surface as the wrong error.
  if (!isValidISODate(date)) throw badRequest("Invalid date.");
  if (isWeekend(date)) throw badRequest("Parking can't be booked for weekends.");
  if (!isBookableDate(date)) {
    throw badRequest(
      "Spots can only be booked up to 2 business days in advance.",
      "OUTSIDE_WINDOW"
    );
  }
  await requireOwnVehicleForBooking(viewer, vehicleId);

  const [spots, bookings, releases] = await Promise.all([
    prisma.parkingSpot.findMany({
      where: { isActive: true, ...(zoneId ? { zoneId } : {}) },
    }),
    prisma.booking.findMany({ where: { date }, select: { spotId: true } }),
    prisma.spotRelease.findMany({ where: { date }, select: { spotId: true } }),
  ]);
  const bookedIds = new Set(bookings.map((b) => b.spotId));
  const releasedIds = new Set(releases.map((r) => r.spotId));

  const candidates = spots
    .filter((s) => !bookedIds.has(s.id))
    .filter(
      (s) =>
        !s.ownerId ||
        !isPrebookDay(s.prebookDays, date) ||
        (releasedIds.has(s.id) && s.ownerId !== viewer.id)
    )
    .sort(spotNumberSort);

  for (const spot of candidates.slice(0, 25)) {
    try {
      return await createBooking(viewer, spot.id, date, vehicleId);
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === "SPOT_TAKEN" ||
          err.code === "SPOT_RESERVED" ||
          // spot deleted/deactivated since the candidate query
          err.code === "NOT_FOUND")
      ) {
        continue; // this spot fell through — try the next one
      }
      throw err;
    }
  }
  throw conflict(
    "No free spots in this zone for that day — try another zone or pick a day from the board.",
    "ZONE_FULL"
  );
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

  try {
    await prisma.booking.delete({ where: { id: bookingId } });
  } catch (err) {
    // Already cancelled by a concurrent request.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw notFound("Booking not found.");
    }
    throw err;
  }
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
    include: {
      spot: { select: { number: true, zone: { select: { name: true } } } },
    },
    orderBy: { date: "desc" },
    take: 200,
  });
  return bookings.map((b) => ({
    id: b.id,
    date: b.date,
    spotNumber: b.spot.number,
    zoneName: b.spot.zone?.name ?? null,
    plate: b.vehiclePlate,
    isPast: b.date < today,
    canCancel: b.date >= today,
  }));
}

// ---------- Home feed ----------

export type HomeReservedDay = {
  date: ISODate;
  spotNumber: string;
  zoneName: string | null;
  released: boolean;
  bookedBy: string | null;
};

/**
 * Data for the Start screen: the viewer's upcoming bookings plus (for
 * management) the auto-prebooked days of their reserved spot over the next
 * week — both rendered as the same kind of card on the client.
 */
export async function getHomeData(viewer: SessionUser) {
  const today = todayInOfficeTz();

  const bookings = await prisma.booking.findMany({
    where: { userId: viewer.id, date: { gte: today } },
    include: {
      spot: { select: { number: true, zone: { select: { name: true } } } },
    },
    orderBy: { date: "asc" },
    take: 20,
  });

  const ownedSpots = await prisma.parkingSpot.findMany({
    where: { ownerId: viewer.id, isActive: true },
    include: { zone: { select: { name: true } } },
  });

  const reserved: HomeReservedDay[] = [];
  if (ownedSpots.length > 0) {
    const dates: ISODate[] = [];
    for (let i = 0; i <= 7; i++) {
      const d = addDays(today, i);
      if (!isWeekend(d)) dates.push(d);
    }
    const spotIds = ownedSpots.map((s) => s.id);
    const [rels, bks] = await Promise.all([
      prisma.spotRelease.findMany({
        where: { spotId: { in: spotIds }, date: { in: dates } },
      }),
      prisma.booking.findMany({
        where: { spotId: { in: spotIds }, date: { in: dates } },
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);
    for (const spot of ownedSpots) {
      for (const d of dates) {
        if (!isPrebookDay(spot.prebookDays, d)) continue;
        const rel = rels.find((r) => r.spotId === spot.id && r.date === d);
        const bk = bks.find((b) => b.spotId === spot.id && b.date === d);
        reserved.push({
          date: d,
          spotNumber: spot.number,
          zoneName: spot.zone?.name ?? null,
          released: !!rel,
          bookedBy: bk ? (bk.user.name ?? bk.user.email) : null,
        });
      }
    }
    reserved.sort((a, b) => compareDates(a.date, b.date));
  }

  return {
    todayCount:
      bookings.filter((b) => b.date === today).length +
      reserved.filter((r) => r.date === today && !r.released).length,
    upcoming: bookings.map((b) => ({
      id: b.id,
      date: b.date,
      spotNumber: b.spot.number,
      zoneName: b.spot.zone?.name ?? null,
      plate: b.vehiclePlate,
    })),
    reserved,
  };
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

  try {
    // Serializable: pairs with createBooking's transaction so a colleague's
    // booking and this reclaim can't both succeed for the same spot/day.
    await serializableTx(async (tx) => {
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

      // Reclaiming while holding a booking elsewhere would give the owner
      // two spots for the day.
      const myOtherBooking = await tx.booking.findUnique({
        where: { userId_date: { userId: viewer.id, date } },
        include: { spot: { select: { number: true } } },
      });
      if (myOtherBooking) {
        throw conflict(
          `You already booked spot ${myOtherBooking.spot.number} for that day — cancel it before reclaiming your own spot.`,
          "HAS_OTHER_BOOKING"
        );
      }

      await tx.spotRelease.delete({ where: { id: release.id } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw conflict("The parking board is busy — please try again.");
    }
    throw err;
  }

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
