import { NextResponse } from "next/server";
import { handleApi, requireUser } from "@/lib/api-helpers";
import { getHomeData } from "@/lib/services/bookings";
import { getBookableDates } from "@/lib/dates";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const viewer = await requireUser();
  const data = await getHomeData(viewer);
  return NextResponse.json({ ...data, bookableDates: getBookableDates() });
});
