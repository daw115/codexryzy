import "server-only";

import { getDocumentDetail, queryMeetings } from "@/lib/api";
import type {
  CerebroMeetingActionItem,
  CerebroMeetingDeadline,
  CerebroMeetingDigest,
  DocumentDetailResponse,
  MeetingQueryItem,
} from "@/lib/types";

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

export type CerebroMeetingQueryParams = {
  limit?: number;
  date_from?: string;
  date_to?: string;
  category?: string;
  project?: string;
  sync_status?: "pending" | "partial" | "synced" | "no_actions";
  search_text?: string;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeActionItem(item: ActionLike): CerebroMeetingActionItem {
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

function normalizeDeadline(item: DeadlineLike): CerebroMeetingDeadline {
  return {
    label: asString(item.label) ?? asString(item.title) ?? "Deadline",
    date: asString(item.date) ?? asString(item.due_at),
  };
}

function fallbackDigest(meeting: MeetingQueryItem): CerebroMeetingDigest {
  return {
    document_id: meeting.document_id,
    revision_id: meeting.revision_id,
    title: meeting.title,
    summary: meeting.summary ?? null,
    category: meeting.category ?? null,
    project: meeting.project ?? null,
    priority: meeting.priority ?? null,
    meeting_day: meeting.meeting_day,
    sync_status: meeting.sync_status,
    mirrored_tasks_count: meeting.mirrored_tasks_count,
    open_tasks_count: meeting.open_tasks_count,
    updated_at: meeting.updated_at,
    action_items: [],
    deadlines: [],
    open_questions: [],
    tasks: [],
  };
}

function mergeMeetingDetail(
  meeting: MeetingQueryItem,
  detail: DocumentDetailResponse,
): CerebroMeetingDigest {
  const rawActions = Array.isArray(detail.analysis?.action_items) ? detail.analysis.action_items : [];
  const rawDeadlines = Array.isArray(detail.analysis?.deadlines) ? detail.analysis.deadlines : [];
  const rawQuestions = Array.isArray(detail.analysis?.open_questions) ? detail.analysis.open_questions : [];

  return {
    document_id: meeting.document_id,
    revision_id: meeting.revision_id,
    title: detail.title,
    summary: detail.analysis?.summary ?? meeting.summary ?? null,
    category: detail.analysis?.category ?? meeting.category ?? null,
    project: meeting.project ?? null,
    priority: detail.analysis?.priority ?? meeting.priority ?? null,
    meeting_day: meeting.meeting_day,
    sync_status: meeting.sync_status,
    mirrored_tasks_count: meeting.mirrored_tasks_count,
    open_tasks_count: meeting.open_tasks_count,
    updated_at: detail.updated_at,
    action_items: rawActions.map((item) => normalizeActionItem((item as ActionLike) ?? {})),
    deadlines: rawDeadlines.map((item) => normalizeDeadline((item as DeadlineLike) ?? {})),
    open_questions: rawQuestions
      .map((question) => asString(question))
      .filter((question): question is string => Boolean(question)),
    tasks: detail.tasks.map((task) => ({
      external_task_id: task.external_task_id,
      external_project_id: task.external_project_id,
      title: task.title,
      description: task.description,
      due_at: task.due_at,
      priority: task.priority,
      status: task.status,
    })),
  };
}

export async function getCerebroMeetingDigests(
  params: CerebroMeetingQueryParams,
): Promise<CerebroMeetingDigest[]> {
  const meetings = await queryMeetings(params);

  const details = await Promise.all(
    meetings.meetings.map(async (meeting) => {
      try {
        const detail = await getDocumentDetail(meeting.document_id);
        return mergeMeetingDetail(meeting, detail);
      } catch {
        return fallbackDigest(meeting);
      }
    }),
  );

  return details;
}
