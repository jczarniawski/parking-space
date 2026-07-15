import { prisma, serializableTx } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/errors";
import { isValidISODate, todayInOfficeTz } from "@/lib/dates";
import type { SessionUser } from "@/lib/api-helpers";

const ROLES = ["EMPLOYEE", "MANAGEMENT", "ADMIN"] as const;

export async function listUsers() {
  const today = todayInOfficeTz();
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    include: {
      ownedSpots: { select: { number: true } },
      _count: { select: { bookings: true } },
      bookings: {
        where: { date: { gte: today } },
        select: { id: true },
      },
    },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    role: u.role,
    ownedSpotNumbers: u.ownedSpots.map((s) => s.number),
    totalBookings: u._count.bookings,
    upcomingBookings: u.bookings.length,
    createdAt: u.createdAt.toISOString(),
  }));
}

export async function setUserRole(
  admin: SessionUser,
  userId: string,
  role: string
) {
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    throw badRequest("Invalid role.");
  }

  const { updated, previousRole, unassignedSpots } = await serializableTx(
    async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw notFound("User not found.");

      // Never allow the org to end up with zero admins — covers both
      // self-demotion and two admins demoting each other concurrently
      // (serializable, so the counts can't both read stale state).
      if (user.role === "ADMIN" && role !== "ADMIN") {
        const otherAdmins = await tx.user.count({
          where: { role: "ADMIN", id: { not: user.id } },
        });
        if (otherAdmins === 0) {
          throw badRequest(
            user.id === admin.id
              ? "You are the only admin — promote someone else first."
              : "That user is the only admin — promote someone else first."
          );
        }
      }

      // Losing MANAGEMENT/ADMIN status also gives up any reserved spot;
      // otherwise the demoted user would keep an auto-prebooked spot and
      // release/reclaim powers forever.
      let unassignedSpots: string[] = [];
      if (role === "EMPLOYEE") {
        const owned = await tx.parkingSpot.findMany({
          where: { ownerId: user.id },
        });
        if (owned.length > 0) {
          unassignedSpots = owned.map((s) => s.number);
          await tx.parkingSpot.updateMany({
            where: { ownerId: user.id },
            data: { ownerId: null },
          });
          await tx.spotRelease.deleteMany({
            where: { spotId: { in: owned.map((s) => s.id) } },
          });
        }
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { role },
      });
      return { updated, previousRole: user.role, unassignedSpots };
    }
  );

  await logAudit({
    action: "ROLE_CHANGED",
    actorEmail: admin.email,
    targetEmail: updated.email,
    details:
      `${previousRole} → ${role}` +
      (unassignedSpots.length > 0
        ? ` (unassigned reserved spot${unassignedSpots.length > 1 ? "s" : ""} ${unassignedSpots.join(", ")})`
        : ""),
  });
  return updated;
}

export type AdminBookingFilters = {
  userId?: string;
  from?: string; // inclusive YYYY-MM-DD
  to?: string; // inclusive YYYY-MM-DD
};

export async function listAllBookings(
  filters: AdminBookingFilters,
  limit = 2000
) {
  if (filters.from && !isValidISODate(filters.from)) throw badRequest("Invalid 'from' date.");
  if (filters.to && !isValidISODate(filters.to)) throw badRequest("Invalid 'to' date.");

  const where = {
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.from || filters.to
      ? {
          date: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const today = todayInOfficeTz();
  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        spot: { select: { number: true, zone: { select: { name: true } } } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return {
    total,
    bookings: bookings.map((b) => ({
      id: b.id,
      date: b.date,
      spotNumber: b.spot.number,
      zoneName: b.spot.zone?.name ?? null,
      plate: b.vehiclePlate,
      userId: b.user.id,
      userName: b.user.name ?? b.user.email,
      userEmail: b.user.email,
      createdAt: b.createdAt.toISOString(),
      isPast: b.date < today,
    })),
  };
}

export function bookingsToCsv(
  rows: Awaited<ReturnType<typeof listAllBookings>>["bookings"]
): string {
  const esc = (v: string) => {
    // Neutralize spreadsheet formula injection: names come from Google
    // profiles and would otherwise execute as formulas when the CSV is
    // opened in Excel/Sheets.
    const guarded = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${guarded.replace(/"/g, '""')}"`;
  };
  const header = ["date", "zone", "spot", "plate", "employee", "email", "booked_at"];
  const lines = rows.map((r) =>
    [
      r.date,
      r.zoneName ?? "",
      r.spotNumber,
      r.plate ?? "",
      r.userName,
      r.userEmail,
      r.createdAt,
    ]
      .map(esc)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export async function listAuditLog(limit = 300) {
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 1000),
  });
  return entries.map((e) => ({
    id: e.id,
    action: e.action,
    actorEmail: e.actorEmail,
    targetEmail: e.targetEmail,
    spotNumber: e.spotNumber,
    date: e.date,
    details: e.details,
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function getOverviewStats() {
  const today = todayInOfficeTz();
  const [totalSpots, activeSpots, bookedToday, releasesToday, users, managementSpots] =
    await Promise.all([
      prisma.parkingSpot.count(),
      prisma.parkingSpot.count({ where: { isActive: true } }),
      prisma.booking.count({ where: { date: today } }),
      prisma.spotRelease.count({ where: { date: today } }),
      prisma.user.count(),
      prisma.parkingSpot.count({ where: { ownerId: { not: null }, isActive: true } }),
    ]);
  return { today, totalSpots, activeSpots, bookedToday, releasesToday, users, managementSpots };
}

export async function isSetupNeeded(): Promise<boolean> {
  return (await prisma.parkingSpot.count()) === 0;
}
