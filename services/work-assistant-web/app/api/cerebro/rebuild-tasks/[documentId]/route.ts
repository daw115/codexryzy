import { NextRequest, NextResponse } from "next/server";

import { isRequestAuthenticated } from "@/lib/auth";
import { rebuildMeetingTasks } from "@/lib/api";

type RouteContext = {
  params: {
    documentId: string;
  };
};

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const projectId = body?.project_id != null ? Number(body.project_id) : undefined;
  const response = await rebuildMeetingTasks(context.params.documentId, Number.isNaN(projectId) ? undefined : projectId);
  return NextResponse.json(response);
}
