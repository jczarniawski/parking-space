import { prisma, serializableTx } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { isPrebookDay, parsePrebookDays, todayInOfficeTz } from "@/lib/dates";
import { parseSpotSpec } from "@/lib/spot-spec";
import type { SessionUser } from "@/lib/api-helpers";

export async function createSpots(admin: SessionUser, spec: string) {
  const labels = parseSpotSpec(spec);
  const existing = await prisma.parkingSpot.findMany({
    where: { number: { in: labels } },
    select: { number: true },
  });
  const existingSet = new Set(existing.map((s) => s.number));
  const toCreate = labels.filter((l) => !existingSet.has(l));

  if (toCreate.length > 0) {
    await prisma.parkingSpot.createMany({
      data: toCreate.map((number) => ({ number })),
    });
    await logAudit({
      action: "SPOTS_CREATED",
      actorEmail: admin.email,
      details: `Created spots: ${toCreate.join(", ")}`,
    });
  }
  return { created: toCreate, skipped: [...existingSet] };
}

export async function listSpots() {
  const spots = await prisma.parkingSpot.findMany({
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  return spots
    .sort((a, b) => {
      const na = Number(a.number);
      const nb = Number(b.number);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    })
    .map((s) => ({
      id: s.id,
      number: s.number,
      isActive: s.isActive,
      prebookDays: s.prebookDays,
      owner: s.owner
        ? { id: s.owner.id, name: s.owner.name, email: s.owner.email }
        : null,
    }));
}

export async function updateSpot(
  admin: SessionUser,
  spotId: string,
  patch: {
    isActive?: boolean;
    prebookDays?: number[];
    // null clears the owner; an email pre-provisions the user if needed
    ownerEmail?: string | null;
  }
) {
  const spot = await prisma.parkingSpot.findUnique({ where: { id: spotId } });
  if (!spot) throw notFound("Spot not found.");

  const data: {
    isActive?: boolean;
    prebookDays?: string;
    ownerId?: string | null;
  } = {};

  if (typeof patch.isActive === "boolean") data.isActive = patch.isActive;

  if (patch.prebookDays !== undefined) {
    const days = patch.prebookDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 5);
    if (days.length === 0) {
      throw badRequest("Pick at least one weekday (Mon–Fri) for prebooking.");
    }
    data.prebookDays = [...new Set(days)].sort().join(",");
  }

  if (patch.ownerEmail !== undefined) {
    if (patch.ownerEmail === null) {
      data.ownerId = null;
    } else {
      const domain = (process.env.ALLOWED_EMAIL_DOMAIN || "match-trade.com").toLowerCase();
      const email = patch.ownerEmail.trim().toLowerCase();
      if (!email.endsWith(`@${domain}`)) {
        throw badRequest(`Owner must have a @${domain} email address.`);
      }
      let owner = await prisma.user.findUnique({ where: { email } });
      if (!owner) {
        // Pre-provision the account; it links up when they first sign in.
        owner = await prisma.user.create({
          data: { email, role: "MANAGEMENT" },
        });
        await logAudit({
          action: "USER_PREPROVISIONED",
          actorEmail: admin.email,
          targetEmail: email,
        });
      } else if (owner.role === "EMPLOYEE") {
        owner = await prisma.user.update({
          where: { id: owner.id },
          data: { role: "MANAGEMENT" },
        });
        await logAudit({
          action: "ROLE_CHANGED",
          actorEmail: admin.email,
          targetEmail: email,
          details: "EMPLOYEE → MANAGEMENT (assigned a reserved spot)",
        });
      }
      data.ownerId = owner.id;
    }
  }

  const today = todayInOfficeTz();
  const { updated, cancelled } = await serializableTx(async (tx) => {
    const fresh = await tx.parkingSpot.findUnique({ where: { id: spotId } });
    if (!fresh) throw notFound("Spot not found.");

    // One reserved spot per owner (checked in the same transaction as the
    // write so concurrent assignments can't slip through).
    if (data.ownerId) {
      const otherOwned = await tx.parkingSpot.findFirst({
        where: { ownerId: data.ownerId, id: { not: spotId } },
      });
      if (otherOwned) {
        throw conflict(
          `That user already owns spot ${otherOwned.number}. Unassign it first.`
        );
      }
    }

    // Making a spot reserved (or extending its prebook days) must not
    // silently trump colleagues' existing bookings — the admin has to cancel
    // those first, so the affected people find out.
    const effectiveOwnerId =
      data.ownerId !== undefined ? data.ownerId : fresh.ownerId;
    const effectivePrebookDays = data.prebookDays ?? fresh.prebookDays;
    if (
      effectiveOwnerId &&
      (data.ownerId !== undefined || data.prebookDays !== undefined)
    ) {
      const futureBookings = await tx.booking.findMany({
        where: { spotId, date: { gte: today }, userId: { not: effectiveOwnerId } },
        include: { user: { select: { email: true } } },
      });
      const conflicting = futureBookings.filter((b) =>
        isPrebookDay(effectivePrebookDays, b.date)
      );
      if (conflicting.length > 0) {
        throw conflict(
          `Spot ${fresh.number} has upcoming bookings on prebooked days (${conflicting
            .map((b) => `${b.date} by ${b.user.email}`)
            .join(", ")}). Cancel them first.`,
          "HAS_UPCOMING_BOOKINGS"
        );
      }
    }

    // Deactivating removes the spot from the board, so upcoming bookings on
    // it would silently strand their holders — cancel them here instead.
    let cancelled: { date: string; email: string }[] = [];
    if (data.isActive === false && fresh.isActive) {
      const upcoming = await tx.booking.findMany({
        where: { spotId, date: { gte: today } },
        include: { user: { select: { email: true } } },
      });
      cancelled = upcoming.map((b) => ({ date: b.date, email: b.user.email }));
      await tx.booking.deleteMany({ where: { spotId, date: { gte: today } } });
      await tx.spotRelease.deleteMany({ where: { spotId, date: { gte: today } } });
    }

    const updated = await tx.parkingSpot.update({ where: { id: spotId }, data });
    return { updated, cancelled };
  });

  for (const c of cancelled) {
    await logAudit({
      action: "BOOKING_CANCELLED",
      actorEmail: admin.email,
      targetEmail: c.email,
      spotNumber: spot.number,
      date: c.date,
      details: "Spot deactivated",
    });
  }
  await logAudit({
    action: "SPOT_UPDATED",
    actorEmail: admin.email,
    spotNumber: spot.number,
    details: JSON.stringify({
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.prebookDays !== undefined ? { prebookDays: data.prebookDays } : {}),
      ...(patch.ownerEmail !== undefined ? { owner: patch.ownerEmail } : {}),
    }),
  });
  return { spot: updated, cancelledBookings: cancelled.length };
}

export async function deleteSpot(admin: SessionUser, spotId: string) {
  const spot = await serializableTx(async (tx) => {
    const fresh = await tx.parkingSpot.findUnique({
      where: { id: spotId },
      include: { _count: { select: { bookings: true } } },
    });
    if (!fresh) throw notFound("Spot not found.");
    if (fresh._count.bookings > 0) {
      throw conflict(
        "This spot has booking history. Deactivate it instead of deleting.",
        "HAS_HISTORY"
      );
    }
    await tx.parkingSpot.delete({ where: { id: spotId } });
    return fresh;
  });
  await logAudit({
    action: "SPOT_DELETED",
    actorEmail: admin.email,
    spotNumber: spot.number,
  });
}

export { parsePrebookDays };
