import { NextResponse } from "next/server";
import { handleApi, requireUser } from "@/lib/api-helpers";
import { listZones } from "@/lib/services/zones";

export const dynamic = "force-dynamic";

// Zones are readable by every signed-in user (needed for booking pickers).
export const GET = handleApi(async () => {
  await requireUser();
  const zones = await listZones();
  return NextResponse.json({ zones });
});
