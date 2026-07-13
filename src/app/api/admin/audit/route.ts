import { NextRequest, NextResponse } from "next/server";
import { handleApi, requireAdmin } from "@/lib/api-helpers";
import { listAuditLog } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (req: NextRequest) => {
  await requireAdmin();
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 300);
  const entries = await listAuditLog(Number.isFinite(limit) ? limit : 300);
  return NextResponse.json({ entries });
});
