import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireUser } from "@/lib/api-helpers";
import { cancelBooking } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";

export const DELETE = handleApi(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const viewer = await requireUser();
    const { id } = await ctx.params;
    await cancelBooking(viewer, id);
    return NextResponse.json({ ok: true });
  }
);
