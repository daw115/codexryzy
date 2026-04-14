export type MailCoverageDay = {
  day: string;
  count: number;
};

export type MailCoverageDocument = {
  document_id: string;
  title: string;
  message_day: string | null;
  message_date_raw: string | null;
  source_modified_label: string | null;
  ingested_at: string;
};

export type MailCoverageResponse = {
  total_email_documents: number;
  covered_days_count: number;
  undated_email_documents: number;
  earliest_message_day: string | null;
  latest_message_day: string | null;
  days: MailCoverageDay[];
  recent_documents: MailCoverageDocument[];
};

export type LlmUsagePeriod = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  calls: number;
};

export type LlmUsageSummary = {
  today: LlmUsagePeriod;
  this_month: LlmUsagePeriod;
  all_time: LlmUsagePeriod;
  quota_monthly_tokens: number | null;
  quota_remaining_tokens: number | null;
};

export type DashboardOpenTask = {
  title: string;
  due_at: string | null;
  priority: number | null;
  project_id: string | null;
  status: string;
};

export type DashboardRecentDocument = {
  title: string;
  created_at: string | null;
  message_day: string | null;
  source_modified_label: string | null;
  summary: string | null;
  category: string | null;
  priority: string | null;
};

export type DashboardCategoryCount = {
  category: string;
  count: number;
};

export type DashboardMeetingMetrics = {
  total_meeting_documents: number;
  meetings_last_30_days: number;
  action_items_total: number;
  mirrored_tasks_total: number;
  open_tasks_total: number;
  vikunja_synced_tasks_total: number;
  pending_sync_meetings: number;
};

export type QuatarlyCreditsResponse = {
  total_credits: number;
  used_credits: number;
  remaining_credits: number;
  reset_date: string;
  expires_at: string | null;
  available: boolean;
  error: string | null;
};

export type DashboardOverviewResponse = {
  environment: string;
  mail_coverage: MailCoverageResponse;
  llm_usage: LlmUsageSummary;
  open_tasks: DashboardOpenTask[];
  recent_documents: DashboardRecentDocument[];
  top_categories: DashboardCategoryCount[];
  meeting_metrics: DashboardMeetingMetrics;
};

export type SearchDocumentHit = {
  document_id: string;
  revision_id: string;
  title: string;
  summary: string | null;
  category: string | null;
  priority: string | null;
  excerpt: string | null;
  score: number;
};

export type SearchTaskHit = {
  external_task_id: string;
  title: string;
  status: string;
  due_at: string | null;
  priority: number | null;
  score: number;
};

export type SearchResponse = {
  query: string;
  documents: SearchDocumentHit[];
  tasks: SearchTaskHit[];
};

export type AssistantCitation = {
  source_type: "document" | "task";
  source_id: string;
  label: string;
  title: string;
  score: number | null;
  excerpt: string | null;
  url: string | null;
};

export type AssistantQueryResponse = {
  query: string;
  answer: string;
  citations: AssistantCitation[];
  documents: SearchDocumentHit[];
  tasks: SearchTaskHit[];
};

export type DocumentListItem = {
  document_id: string;
  revision_id: string;
  source_type: string;
  external_id: string;
  title: string;
  mime_type: string;
  raw_storage_url: string | null;
  artifact_type: string | null;
  summary: string | null;
  category: string | null;
  priority: string | null;
  message_day: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentQueryResponse = {
  documents: DocumentListItem[];
};

export type DocumentAnalysisRead = {
  model: string;
  prompt_version: string;
  summary: string;
  category: string | null;
  priority: string | null;
  confidence: number | null;
  action_items: Array<Record<string, unknown>>;
  entities: Array<Record<string, unknown>>;
  deadlines: Array<Record<string, unknown>>;
  open_questions: string[];
  metadata: Record<string, unknown>;
};

export type DocumentDetailTask = {
  external_task_id: string;
  external_project_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: number | null;
  status: string;
};

export type DocumentDetailResponse = {
  document_id: string;
  revision_id: string;
  source_type: string;
  external_id: string;
  title: string;
  mime_type: string;
  raw_storage_url: string | null;
  created_at: string;
  updated_at: string;
  source_metadata: Record<string, unknown>;
  document_metadata: Record<string, unknown>;
  extracted_text: string;
  normalized_text: string;
  language: string | null;
  analysis: DocumentAnalysisRead | null;
  tasks: DocumentDetailTask[];
};

export type TaskListItem = {
  external_task_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  priority: number | null;
  updated_at: string;
};

export type TaskListResponse = {
  tasks: TaskListItem[];
};

export type TaskScheduleResponse = {
  generated_at: string;
  overdue: TaskListItem[];
  today: TaskListItem[];
  next_7_days: TaskListItem[];
  later: TaskListItem[];
  unscheduled: TaskListItem[];
};

export type MeetingIntakeResponse = {
  status: "ingested" | "deduplicated";
  source_id: string;
  document_id: string;
  revision_id: string;
  processing_version: number;
  action_items_detected: number;
  mirrored_tasks: number;
  vikunja_synced: number;
  sync_errors: string[];
};

export type MeetingQueryItem = {
  document_id: string;
  revision_id: string;
  title: string;
  summary: string | null;
  category: string | null;
  priority: string | null;
  project: string | null;
  meeting_day: string | null;
  action_items_count: number;
  mirrored_tasks_count: number;
  open_tasks_count: number;
  latest_due_at: string | null;
  sync_status: "pending" | "partial" | "synced" | "no_actions";
  updated_at: string;
};

export type MeetingQueryResponse = {
  meetings: MeetingQueryItem[];
};

export type MeetingTaskRebuildResponse = {
  document_id: string;
  revision_id: string;
  action_items_detected: number;
  mirrored_tasks: number;
  vikunja_synced: number;
  sync_errors: string[];
};

export type MeetingBulkSyncItem = {
  document_id: string;
  title: string;
  action_items_detected: number;
  mirrored_tasks: number;
  vikunja_synced: number;
  sync_errors: string[];
};

export type MeetingBulkSyncResponse = {
  processed: number;
  synced: number;
  with_errors: number;
  items: MeetingBulkSyncItem[];
};

export type TaskActionResponse = {
  external_task_id: string;
  title: string;
  status: string;
  due_at: string | null;
  priority: number | null;
  project_id: string | null;
};

export type CerebroMeetingActionItem = {
  title: string;
  owner: string | null;
  due_at: string | null;
  status: string | null;
  description: string | null;
};

export type CerebroMeetingDeadline = {
  label: string;
  date: string | null;
};

export type CerebroMeetingDigest = {
  document_id: string;
  revision_id: string;
  title: string;
  summary: string | null;
  category: string | null;
  project: string | null;
  priority: string | null;
  meeting_day: string | null;
  sync_status: "pending" | "partial" | "synced" | "no_actions";
  mirrored_tasks_count: number;
  open_tasks_count: number;
  updated_at: string;
  action_items: CerebroMeetingActionItem[];
  deadlines: CerebroMeetingDeadline[];
  open_questions: string[];
  tasks: Array<{
    external_task_id: string;
    external_project_id: string | null;
    title: string;
    description: string | null;
    due_at: string | null;
    priority: number | null;
    status: string;
  }>;
};
