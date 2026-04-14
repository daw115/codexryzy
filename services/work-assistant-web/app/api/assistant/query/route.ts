import { NextRequest, NextResponse } from "next/server";

import { askAssistant } from "@/lib/api";
import { isRequestAuthenticated } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const response = await askAssistant({
    query: String(body.query ?? ""),
    search_limit: Number(body.search_limit ?? 8),
    include_tasks: Boolean(body.include_tasks ?? true),
    max_document_contexts: Number(body.max_document_contexts ?? 5),
    max_task_contexts: Number(body.max_task_contexts ?? 5),
  });
  return NextResponse.json(response);
}
