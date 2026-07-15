import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireUser } from "@/lib/api-helpers";
import { addVehicle, listMyVehicles } from "@/lib/services/vehicles";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const viewer = await requireUser();
  const vehicles = await listMyVehicles(viewer);
  return NextResponse.json({ vehicles });
});

export const POST = handleApi(async (req: NextRequest) => {
  const viewer = await requireUser();
  const body = await req.json().catch(() => null);
  const plate = typeof body?.plate === "string" ? body.plate : "";
  if (!plate.trim()) throw badRequest("plate is required.");
  const vehicle = await addVehicle(viewer, plate);
  return NextResponse.json({ vehicle }, { status: 201 });
});
