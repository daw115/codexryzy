import { NextRequest, NextResponse } from "next/server";

import { generateTodayBriefing, getTodayBriefing } from "@/lib/api";
import { isRequestAuthenticated } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const briefing = await getTodayBriefing();
  if (!briefing) {
    return NextResponse.json({ detail: "No briefing for today yet" }, { status: 404 });
  }

  return NextResponse.json(briefing);
}

export async function POST(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const briefing = await generateTodayBriefing(Boolean(body.force ?? true));
  return NextResponse.json(briefing);
}
