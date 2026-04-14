import { NextRequest, NextResponse } from "next/server";

import { queryDocuments } from "@/lib/api";
import { isRequestAuthenticated } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const searchText = String(body.query ?? "").trim();
  const response = await queryDocuments({
    artifact_type: "email",
    search_text: searchText || undefined,
    limit: Number(body.limit ?? 24),
  });
  return NextResponse.json(response);
}
