import { prisma } from "@/lib/db";
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
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User not found.");

  if (user.id === admin.id && role !== "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { role: "ADMIN", id: { not: admin.id } },
    });
    if (otherAdmins === 0) {
      throw badRequest("You are the only admin — promote someone else first.");
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
  });
  await logAudit({
    action: "ROLE_CHANGED",
    actorEmail: admin.email,
    targetEmail: user.email,
    details: `${user.role} → ${role}`,
  });
  return updated;
}

export type AdminBookingFilters = {
  userId?: string;
  from?: string; // inclusive YYYY-MM-DD
  to?: string; // inclusive YYYY-MM-DD
};

export async function listAllBookings(filters: AdminBookingFilters) {
  if (filters.from && !isValidISODate(filters.from)) throw badRequest("Invalid 'from' date.");
  if (filters.to && !isValidISODate(filters.to)) throw badRequest("Invalid 'to' date.");

  const today = todayInOfficeTz();
  const bookings = await prisma.booking.findMany({
    where: {
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.from || filters.to
        ? {
            date: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      spot: { select: { number: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 2000,
  });

  return bookings.map((b) => ({
    id: b.id,
    date: b.date,
    spotNumber: b.spot.number,
    userId: b.user.id,
    userName: b.user.name ?? b.user.email,
    userEmail: b.user.email,
    createdAt: b.createdAt.toISOString(),
    isPast: b.date < today,
  }));
}

export function bookingsToCsv(
  rows: Awaited<ReturnType<typeof listAllBookings>>
): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ["date", "spot", "employee", "email", "booked_at"];
  const lines = rows.map((r) =>
    [r.date, r.spotNumber, r.userName, r.userEmail, r.createdAt].map(esc).join(",")
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
