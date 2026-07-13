import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireAdmin } from "@/lib/api-helpers";
import { setUserRole } from "@/lib/services/admin";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const PATCH = handleApi(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const role = typeof body?.role === "string" ? body.role : "";
    if (!role) throw badRequest("role is required.");
    const user = await setUserRole(admin, id, role);
    return NextResponse.json({
      user: { id: user.id, email: user.email, role: user.role },
    });
  }
);
