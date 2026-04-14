import { NextRequest, NextResponse } from "next/server";

import { isRequestAuthenticated } from "@/lib/auth";
import { completeMeetingTask } from "@/lib/api";

type RouteContext = {
  params: {
    taskId: string;
  };
};

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const response = await completeMeetingTask(context.params.taskId);
  return NextResponse.json(response);
}
