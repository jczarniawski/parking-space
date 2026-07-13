import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireAdmin } from "@/lib/api-helpers";
import { createSpots, listSpots } from "@/lib/services/spots";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await requireAdmin();
  const spots = await listSpots();
  return NextResponse.json({ spots });
});

export const POST = handleApi(async (req: NextRequest) => {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const spec = typeof body?.spec === "string" ? body.spec : "";
  if (!spec.trim()) throw badRequest("Provide spot numbers, e.g. \"1-10, 12\".");
  const result = await createSpots(admin, spec);
  return NextResponse.json(result, { status: 201 });
});
