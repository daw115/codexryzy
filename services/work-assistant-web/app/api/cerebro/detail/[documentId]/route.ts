import { NextRequest, NextResponse } from "next/server";

import { isRequestAuthenticated } from "@/lib/auth";
import { getDocumentDetail } from "@/lib/api";

type ActionLike = {
  title?: unknown;
  task?: unknown;
  description?: unknown;
  owner?: unknown;
  assignee?: unknown;
  due_at?: unknown;
  deadline?: unknown;
  status?: unknown;
  completed?: unknown;
};

type DeadlineLike = {
  label?: unknown;
  title?: unknown;
  date?: unknown;
  due_at?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function normalizeActionItem(item: ActionLike) {
  const status =
    asString(item.status) ??
    (item.completed === true || item.completed === "true" ? "done" : "open");
  return {
    title: asString(item.title) ?? asString(item.task) ?? "Action item",
    owner: asString(item.owner) ?? asString(item.assignee),
    due_at: asString(item.due_at) ?? asString(item.deadline),
    status,
    description: asString(item.description),
  };
}

function normalizeDeadline(item: DeadlineLike) {
  return {
    label: asString(item.label) ?? asString(item.title) ?? "Deadline",
    date: asString(item.date) ?? asString(item.due_at),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { documentId: string } },
) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = params;
  if (!documentId) {
    return NextResponse.json({ detail: "Missing documentId" }, { status: 400 });
  }

  const detail = await getDocumentDetail(documentId);

  const rawActions = Array.isArray(detail.analysis?.action_items) ? detail.analysis.action_items : [];
  const rawDeadlines = Array.isArray(detail.analysis?.deadlines) ? detail.analysis.deadlines : [];
  const rawQuestions = Array.isArray(detail.analysis?.open_questions) ? detail.analysis.open_questions : [];

  return NextResponse.json({
    document_id: detail.document_id,
    title: detail.title,
    summary: detail.analysis?.summary ?? null,
    category: detail.analysis?.category ?? null,
    priority: detail.analysis?.priority ?? null,
    updated_at: detail.updated_at,
    action_items: rawActions.map((item) => normalizeActionItem(item as ActionLike)),
    deadlines: rawDeadlines.map((item) => normalizeDeadline(item as DeadlineLike)),
    open_questions: rawQuestions
      .map((q) => asString(q))
      .filter((q): q is string => q !== null),
    tasks: detail.tasks.map((t) => ({
      external_task_id: t.external_task_id,
      external_project_id: t.external_project_id,
      title: t.title,
      description: t.description,
      due_at: t.due_at,
      priority: t.priority,
      status: t.status,
    })),
  });
}
