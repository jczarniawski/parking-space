import { Prisma } from "@prisma/client";
import { prisma, serializableTx } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import type { SessionUser } from "@/lib/api-helpers";

/** Normalize a registration plate: uppercase, single spaces, no frills. */
export function normalizePlate(plate: string): string {
  const normalized = plate.trim().toUpperCase().replace(/\s+/g, " ");
  if (!/^[A-Z0-9][A-Z0-9 -]{1,11}$/.test(normalized)) {
    throw badRequest(
      "Enter a valid registration plate (2–12 letters/digits, e.g. PY 1075E).",
      "PLATE_INVALID"
    );
  }
  return normalized;
}

export async function listMyVehicles(viewer: SessionUser) {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId: viewer.id },
    orderBy: { createdAt: "asc" },
  });
  return vehicles.map((v) => ({ id: v.id, plate: v.plate }));
}

export async function addVehicle(viewer: SessionUser, plate: string) {
  const normalized = normalizePlate(plate);
  try {
    // Serializable so concurrent adds can't slip past the cap.
    const vehicle = await serializableTx(async (tx) => {
      const count = await tx.vehicle.count({ where: { userId: viewer.id } });
      if (count >= 5) {
        throw badRequest("You can keep at most 5 vehicles — remove one first.", "VEHICLE_LIMIT");
      }
      return tx.vehicle.create({
        data: { userId: viewer.id, plate: normalized },
      });
    });
    return { id: vehicle.id, plate: vehicle.plate };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("You already added that plate.", "PLATE_EXISTS");
    }
    throw err;
  }
}

export async function deleteVehicle(viewer: SessionUser, vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.userId !== viewer.id) {
    throw notFound("Vehicle not found.");
  }
  // Bookings keep their vehiclePlate snapshot; the relation just goes null.
  await prisma.vehicle.delete({ where: { id: vehicleId } });
}

/** Resolve and authorize a vehicle for a booking. */
export async function requireOwnVehicle(viewer: SessionUser, vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.userId !== viewer.id) {
    throw badRequest("Pick one of your saved vehicles.", "VEHICLE_REQUIRED");
  }
  return vehicle;
}
