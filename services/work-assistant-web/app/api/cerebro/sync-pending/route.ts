import { NextRequest, NextResponse } from "next/server";

import { bulkSyncPendingMeetings } from "@/lib/api";
import { isRequestAuthenticated } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const response = await bulkSyncPendingMeetings({
    limit: body?.limit != null ? Number(body.limit) : undefined,
    date_from: body?.date_from ? String(body.date_from) : undefined,
    date_to: body?.date_to ? String(body.date_to) : undefined,
    project_id: body?.project_id != null ? Number(body.project_id) : undefined,
  });

  return NextResponse.json(response);
}
