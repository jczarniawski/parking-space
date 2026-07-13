import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { parsePrebookDays } from "@/lib/dates";
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
      const otherOwned = await prisma.parkingSpot.findFirst({
        where: { ownerId: owner.id, id: { not: spotId } },
      });
      if (otherOwned) {
        throw conflict(
          `${email} already owns spot ${otherOwned.number}. Unassign it first.`
        );
      }
      data.ownerId = owner.id;
    }
  }

  const updated = await prisma.parkingSpot.update({ where: { id: spotId }, data });
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
  return updated;
}

export async function deleteSpot(admin: SessionUser, spotId: string) {
  const spot = await prisma.parkingSpot.findUnique({
    where: { id: spotId },
    include: { _count: { select: { bookings: true } } },
  });
  if (!spot) throw notFound("Spot not found.");
  if (spot._count.bookings > 0) {
    throw conflict(
      "This spot has booking history. Deactivate it instead of deleting.",
      "HAS_HISTORY"
    );
  }
  await prisma.parkingSpot.delete({ where: { id: spotId } });
  await logAudit({
    action: "SPOT_DELETED",
    actorEmail: admin.email,
    spotNumber: spot.number,
  });
}

export { parsePrebookDays };
