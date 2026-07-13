import { NextResponse } from "next/server";
import { handleApi, requireAdmin } from "@/lib/api-helpers";
import { listUsers } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  await requireAdmin();
  const users = await listUsers();
  return NextResponse.json({ users });
});
