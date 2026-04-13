import { NextRequest, NextResponse } from "next/server";

import { isRequestAuthenticated } from "@/lib/auth";
import { getCerebroMeetingDigests } from "@/lib/cerebro";

export async function GET(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  const limitParam = Number(url.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), 100) : 30;
  const meetings = await getCerebroMeetingDigests({
    limit,
    date_from: url.searchParams.get("date_from") ?? undefined,
    date_to: url.searchParams.get("date_to") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    project: url.searchParams.get("project") ?? undefined,
    sync_status:
      (url.searchParams.get("sync_status") as "pending" | "partial" | "synced" | "no_actions" | null) ?? undefined,
    search_text: url.searchParams.get("search_text") ?? undefined,
  });

  return NextResponse.json({ meetings });
}
