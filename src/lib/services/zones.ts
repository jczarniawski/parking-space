import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import type { SessionUser } from "@/lib/api-helpers";

function normalizeZoneName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 40) {
    throw badRequest("Zone name must be 2–40 characters.");
  }
  return trimmed;
}

/** Zones with their active-spot counts, for pickers and admin screens. */
export async function listZones() {
  const zones = await prisma.parkingZone.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { spots: true } } },
  });
  return zones.map((z) => ({
    id: z.id,
    name: z.name,
    spotCount: z._count.spots,
  }));
}

export async function createZone(admin: SessionUser, name: string) {
  const normalized = normalizeZoneName(name);
  const existing = await prisma.parkingZone.findUnique({
    where: { name: normalized },
  });
  if (existing) throw conflict(`Zone "${normalized}" already exists.`);
  const zone = await prisma.parkingZone.create({ data: { name: normalized } });
  await logAudit({
    action: "ZONE_CREATED",
    actorEmail: admin.email,
    details: normalized,
  });
  return zone;
}

export async function renameZone(admin: SessionUser, zoneId: string, name: string) {
  const normalized = normalizeZoneName(name);
  const zone = await prisma.parkingZone.findUnique({ where: { id: zoneId } });
  if (!zone) throw notFound("Zone not found.");
  const clash = await prisma.parkingZone.findUnique({ where: { name: normalized } });
  if (clash && clash.id !== zoneId) {
    throw conflict(`Zone "${normalized}" already exists.`);
  }
  const updated = await prisma.parkingZone.update({
    where: { id: zoneId },
    data: { name: normalized },
  });
  await logAudit({
    action: "ZONE_UPDATED",
    actorEmail: admin.email,
    details: `${zone.name} → ${normalized}`,
  });
  return updated;
}

export async function deleteZone(admin: SessionUser, zoneId: string) {
  const zone = await prisma.parkingZone.findUnique({
    where: { id: zoneId },
    include: { _count: { select: { spots: true } } },
  });
  if (!zone) throw notFound("Zone not found.");
  if (zone._count.spots > 0) {
    throw conflict(
      `Zone "${zone.name}" still has ${zone._count.spots} spot(s). Move them to another zone first.`
    );
  }
  await prisma.parkingZone.delete({ where: { id: zoneId } });
  await logAudit({
    action: "ZONE_DELETED",
    actorEmail: admin.email,
    details: zone.name,
  });
}
