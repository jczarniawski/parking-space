import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireAdmin } from "@/lib/api-helpers";
import { deleteZone, renameZone } from "@/lib/services/zones";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const PATCH = handleApi(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name : "";
    if (!name.trim()) throw badRequest("name is required.");
    const zone = await renameZone(admin, id, name);
    return NextResponse.json({ zone });
  }
);

export const DELETE = handleApi(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    await deleteZone(admin, id);
    return NextResponse.json({ ok: true });
  }
);
