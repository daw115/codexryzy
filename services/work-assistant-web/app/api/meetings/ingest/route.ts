import { NextRequest, NextResponse } from "next/server";

import { ingestMeetingAnalysis } from "@/lib/api";
import { isRequestAuthenticated } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const transcript = String(body.transcript ?? "").trim();
  const title = String(body.title ?? "").trim();

  if (!title || !transcript) {
    return NextResponse.json(
      { detail: "title and transcript are required" },
      { status: 422 },
    );
  }

  const response = await ingestMeetingAnalysis({
    title,
    external_id: body.external_id ? String(body.external_id) : undefined,
    project: body.project ? String(body.project) : undefined,
    project_id: body.project_id != null ? Number(body.project_id) : undefined,
    meeting_date: body.meeting_date ? String(body.meeting_date) : undefined,
    source_url: body.source_url ? String(body.source_url) : undefined,
    summary: body.summary ? String(body.summary) : undefined,
    participants: Array.isArray(body.participants) ? body.participants.map(String) : [],
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    transcript,
    tasks: Array.isArray(body.tasks)
      ? body.tasks.map((task: Record<string, unknown>) => ({
          title: String(task.title ?? ""),
          description: task.description ? String(task.description) : undefined,
          due_at: task.due_at ? String(task.due_at) : undefined,
          priority: task.priority != null ? Number(task.priority) : undefined,
          owner: task.owner ? String(task.owner) : undefined,
        }))
      : [],
  });

  return NextResponse.json(response, { status: 202 });
}
