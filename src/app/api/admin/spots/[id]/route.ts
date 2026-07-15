import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireAdmin } from "@/lib/api-helpers";
import { deleteSpot, updateSpot } from "@/lib/services/spots";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const PATCH = handleApi(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw badRequest("Invalid body.");

    const patch: {
      isActive?: boolean;
      prebookDays?: number[];
      ownerEmail?: string | null;
      zoneId?: string | null;
    } = {};
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    if (Array.isArray(body.prebookDays)) {
      patch.prebookDays = body.prebookDays.map((n: unknown) => Number(n));
    }
    if (body.ownerEmail === null || typeof body.ownerEmail === "string") {
      patch.ownerEmail = body.ownerEmail;
    }
    if (body.zoneId === null || typeof body.zoneId === "string") {
      patch.zoneId = body.zoneId;
    }
    if (Object.keys(patch).length === 0) throw badRequest("Nothing to update.");

    const result = await updateSpot(admin, id, patch);
    return NextResponse.json(result);
  }
);

export const DELETE = handleApi(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    await deleteSpot(admin, id);
    return NextResponse.json({ ok: true });
  }
);
