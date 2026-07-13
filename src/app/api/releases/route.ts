import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireUser } from "@/lib/api-helpers";
import { listMyReleases, releaseSpot, reclaimSpot } from "@/lib/services/bookings";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const viewer = await requireUser();
  const data = await listMyReleases(viewer);
  return NextResponse.json(data);
});

export const POST = handleApi(async (req: NextRequest) => {
  const viewer = await requireUser();
  const body = await req.json().catch(() => null);
  const date = typeof body?.date === "string" ? body.date : "";
  if (!date) throw badRequest("date is required.");
  const release = await releaseSpot(viewer, date);
  return NextResponse.json({ release }, { status: 201 });
});

export const DELETE = handleApi(async (req: NextRequest) => {
  const viewer = await requireUser();
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!date) throw badRequest("date is required.");
  await reclaimSpot(viewer, date);
  return NextResponse.json({ ok: true });
});
