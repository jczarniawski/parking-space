import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireAdmin } from "@/lib/api-helpers";
import { createZone, listZones } from "@/lib/services/zones";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await requireAdmin();
  const zones = await listZones();
  return NextResponse.json({ zones });
});

export const POST = handleApi(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) throw badRequest("name is required.");
  const zone = await createZone(admin, name);
  return NextResponse.json({ zone }, { status: 201 });
});
