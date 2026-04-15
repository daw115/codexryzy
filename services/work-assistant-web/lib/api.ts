import "server-only";

import type {
  AssistantQueryResponse,
  BriefingResponse,
  DashboardOverviewResponse,
  DocumentDetailResponse,
  DocumentQueryResponse,
  MeetingBulkSyncResponse,
  MeetingIntakeResponse,
  MeetingQueryResponse,
  MeetingTaskRebuildResponse,
  QuatarlyCreditsResponse,
  SearchResponse,
  TaskActionResponse,
  TaskListResponse,
  TaskScheduleResponse,
} from "@/lib/types";

function getApiConfig() {
  const baseUrl = process.env.WORK_ASSISTANT_API_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.WORK_ASSISTANT_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    throw new Error("WORK_ASSISTANT_API_URL and WORK_ASSISTANT_API_KEY must be configured");
  }

  return { baseUrl, apiKey };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, apiKey } = getApiConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  return (await response.json()) as T;
}

export async function getDashboardOverview(): Promise<DashboardOverviewResponse> {
  return apiFetch<DashboardOverviewResponse>("/v1/dashboard/overview");
}

export async function getQuatarlyCredits(): Promise<QuatarlyCreditsResponse> {
  return apiFetch<QuatarlyCreditsResponse>("/v1/credits/quatarly");
}

export async function queryDocuments(body: {
  limit?: number;
  source_type?: string;
  artifact_type?: string;
  category?: string;
  search_text?: string;
}): Promise<DocumentQueryResponse> {
  return apiFetch<DocumentQueryResponse>("/v1/documents/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getDocumentDetail(documentId: string): Promise<DocumentDetailResponse> {
  return apiFetch<DocumentDetailResponse>(`/v1/documents/${documentId}`);
}

export async function searchKnowledgeBase(body: {
  query: string;
  limit?: number;
  include_tasks?: boolean;
}): Promise<SearchResponse> {
  return apiFetch<SearchResponse>("/v1/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function askAssistant(body: {
  query: string;
  search_limit?: number;
  include_tasks?: boolean;
  max_document_contexts?: number;
  max_task_contexts?: number;
}): Promise<AssistantQueryResponse> {
  return apiFetch<AssistantQueryResponse>("/v1/assistant/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function ingestMeetingAnalysis(body: {
  title: string;
  project?: string;
  project_id?: number;
  external_id?: string;
  meeting_date?: string;
  source_url?: string;
  summary?: string;
  transcript: string;
  participants?: string[];
  tags?: string[];
  tasks?: Array<{ title: string; due_at?: string; priority?: number; description?: string; owner?: string }>;
}): Promise<MeetingIntakeResponse> {
  const checksumSource = JSON.stringify(body);
  const externalId =
    body.external_id?.trim() ||
    `meeting-${Buffer.from(checksumSource).toString("base64url").slice(0, 24)}`;
  return apiFetch<MeetingIntakeResponse>("/v1/meetings/intake", {
    method: "POST",
    body: JSON.stringify({
      source_type: "manual_upload",
      external_id: externalId,
      title: body.title,
      meeting_date: body.meeting_date ?? null,
      project: body.project ?? null,
      project_id: body.project_id ?? null,
      source_url: body.source_url ?? null,
      summary: body.summary ?? null,
      participants: body.participants ?? [],
      tags: body.tags ?? [],
      transcript: body.transcript,
      action_items: (body.tasks ?? []).map((task) => ({
        title: task.title,
        description: task.description ?? null,
        owner: task.owner ?? null,
        due_at: task.due_at ?? null,
        priority: task.priority ?? null,
      })),
      auto_sync_tasks: true,
    }),
  });
}

export async function queryMeetings(params: {
  limit?: number;
  date_from?: string;
  date_to?: string;
  category?: string;
  project?: string;
  sync_status?: "pending" | "partial" | "synced" | "no_actions";
  search_text?: string;
}): Promise<MeetingQueryResponse> {
  const query = new URLSearchParams();
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.date_from) query.set("date_from", params.date_from);
  if (params.date_to) query.set("date_to", params.date_to);
  if (params.category) query.set("category", params.category);
  if (params.project) query.set("project", params.project);
  if (params.sync_status) query.set("sync_status", params.sync_status);
  if (params.search_text) query.set("search_text", params.search_text);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<MeetingQueryResponse>(`/v1/meetings/query${suffix}`);
}

export async function rebuildMeetingTasks(
  documentId: string,
  projectId?: number,
): Promise<MeetingTaskRebuildResponse> {
  return apiFetch<MeetingTaskRebuildResponse>(`/v1/meetings/${documentId}/rebuild-tasks`, {
    method: "POST",
    body: JSON.stringify({
      project_id: projectId ?? null,
    }),
  });
}

export async function completeMeetingTask(externalTaskId: string): Promise<TaskActionResponse> {
  return apiFetch<TaskActionResponse>(
    `/v1/meetings/tasks/${encodeURIComponent(externalTaskId)}/complete`,
    {
      method: "POST",
    },
  );
}

export async function bulkSyncPendingMeetings(body?: {
  limit?: number;
  date_from?: string;
  date_to?: string;
  project_id?: number | null;
}): Promise<MeetingBulkSyncResponse> {
  return apiFetch<MeetingBulkSyncResponse>("/v1/meetings/sync-pending", {
    method: "POST",
    body: JSON.stringify({
      limit: body?.limit ?? 20,
      date_from: body?.date_from ?? null,
      date_to: body?.date_to ?? null,
      project_id: body?.project_id ?? null,
    }),
  });
}

export async function getOpenTasks(limit = 40): Promise<TaskListResponse> {
  return apiFetch<TaskListResponse>("/v1/tasks/query", {
    method: "POST",
    body: JSON.stringify({
      statuses: ["open"],
      limit,
    }),
  });
}

export async function getTaskSchedule(horizonDays = 7, limit = 200): Promise<TaskScheduleResponse> {
  return apiFetch<TaskScheduleResponse>(
    `/v1/tasks/schedule?horizon_days=${encodeURIComponent(String(horizonDays))}&limit=${encodeURIComponent(
      String(limit),
    )}`,
  );
}

export async function getOverdueTasks(limit = 20): Promise<TaskListResponse> {
  return apiFetch<TaskListResponse>("/v1/tasks/query", {
    method: "POST",
    body: JSON.stringify({
      statuses: ["open"],
      due_before: new Date().toISOString(),
      limit,
    }),
  });
}

export async function getUpcomingTasks(daysAhead = 7, limit = 20): Promise<TaskListResponse> {
  const boundary = new Date();
  boundary.setDate(boundary.getDate() + daysAhead);
  boundary.setHours(23, 59, 59, 999);

  return apiFetch<TaskListResponse>("/v1/tasks/query", {
    method: "POST",
    body: JSON.stringify({
      statuses: ["open"],
      due_before: boundary.toISOString(),
      limit,
    }),
  });
}

export async function getTodayBriefing(): Promise<BriefingResponse | null> {
  try {
    return await apiFetch<BriefingResponse>("/v1/briefing/today");
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    throw error;
  }
}

export async function generateTodayBriefing(force = true): Promise<BriefingResponse> {
  return apiFetch<BriefingResponse>("/v1/briefing/generate", {
    method: "POST",
    body: JSON.stringify({ force }),
  });
}
