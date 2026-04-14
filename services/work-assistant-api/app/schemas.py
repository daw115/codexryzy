from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


SourceType = Literal[
    "google_drive",
    "manual_upload",
    "email",
    "document",
    "pdf",
    "docx",
    "xlsx",
    "pptx",
    "spreadsheet",
    "presentation",
    "web_research",
    "webpage",
    "email_attachment",
    "meeting_analysis",
    "vikunja",
    "n8n",
]


class DocumentChunkPayload(BaseModel):
    chunk_index: int = Field(..., ge=0)
    content: str = Field(..., min_length=1)
    token_count: int | None = Field(None, ge=0)
    embedding: list[float] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentAnalysisPayload(BaseModel):
    model: str
    prompt_version: str
    summary: str
    category: str | None = None
    priority: str | None = None
    confidence: float | None = Field(None, ge=0.0, le=1.0)
    action_items: list[dict[str, Any]] = Field(default_factory=list)
    entities: list[dict[str, Any]] = Field(default_factory=list)
    deadlines: list[dict[str, Any]] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskMirrorPayload(BaseModel):
    external_task_id: str | None = None
    external_project_id: str | None = None
    title: str
    description: str | None = None
    due_at: datetime | None = None
    priority: int | None = None
    status: str = "open"
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestDocumentRequest(BaseModel):
    source_type: SourceType
    external_id: str
    checksum: str | None = None
    title: str
    mime_type: str
    raw_storage_url: str | None = None
    extracted_text: str = Field(..., min_length=1)
    normalized_text: str | None = None
    language: str | None = None
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    document_metadata: dict[str, Any] = Field(default_factory=dict)
    analysis: DocumentAnalysisPayload | None = None
    chunks: list[DocumentChunkPayload] = Field(default_factory=list)
    tasks: list[TaskMirrorPayload] = Field(default_factory=list)
    skip_if_checksum_matches: bool = True
    auto_sync_tasks: bool = False


class IngestDocumentResponse(BaseModel):
    status: Literal["ingested", "deduplicated"]
    source_id: str
    document_id: str
    revision_id: str
    processing_version: int
    stored_chunks: int
    mirrored_tasks: int
    vikunja_synced: int = 0
    sync_errors: list[str] = Field(default_factory=list)


class DocumentMetadataRefreshRequest(BaseModel):
    source_type: SourceType
    external_id: str
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    document_metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentMetadataRefreshResponse(BaseModel):
    source_id: str
    document_id: str
    revision_id: str | None = None
    updated_source_metadata: bool
    updated_document_metadata: bool
    updated_revision_metadata: bool


class DocumentQueryRequest(BaseModel):
    limit: int = Field(25, ge=1, le=100)
    source_type: SourceType | None = None
    artifact_type: str | None = None
    category: str | None = None
    search_text: str | None = None


class DocumentListItem(BaseModel):
    document_id: str
    revision_id: str
    source_type: str
    external_id: str
    title: str
    mime_type: str
    raw_storage_url: str | None = None
    artifact_type: str | None = None
    summary: str | None = None
    category: str | None = None
    priority: str | None = None
    message_day: str | None = None
    created_at: datetime
    updated_at: datetime


class DocumentQueryResponse(BaseModel):
    documents: list[DocumentListItem] = Field(default_factory=list)


class DocumentAnalysisRead(BaseModel):
    model: str
    prompt_version: str
    summary: str
    category: str | None = None
    priority: str | None = None
    confidence: float | None = None
    action_items: list[dict[str, Any]] = Field(default_factory=list)
    entities: list[dict[str, Any]] = Field(default_factory=list)
    deadlines: list[dict[str, Any]] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentDetailTask(BaseModel):
    external_task_id: str
    external_project_id: str | None = None
    title: str
    description: str | None = None
    due_at: datetime | None = None
    priority: int | None = None
    status: str


class DocumentDetailResponse(BaseModel):
    document_id: str
    revision_id: str
    source_type: str
    external_id: str
    title: str
    mime_type: str
    raw_storage_url: str | None = None
    created_at: datetime
    updated_at: datetime
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    document_metadata: dict[str, Any] = Field(default_factory=dict)
    extracted_text: str
    normalized_text: str
    language: str | None = None
    analysis: DocumentAnalysisRead | None = None
    tasks: list[DocumentDetailTask] = Field(default_factory=list)


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(10, ge=1, le=50)
    include_tasks: bool = True


class SearchDocumentHit(BaseModel):
    document_id: str
    revision_id: str
    title: str
    summary: str | None = None
    category: str | None = None
    priority: str | None = None
    excerpt: str | None = None
    score: float


class SearchTaskHit(BaseModel):
    external_task_id: str
    title: str
    status: str
    due_at: datetime | None = None
    priority: int | None = None
    score: float


class SearchResponse(BaseModel):
    query: str
    documents: list[SearchDocumentHit] = Field(default_factory=list)
    tasks: list[SearchTaskHit] = Field(default_factory=list)


class AssistantQueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    search_limit: int = Field(8, ge=1, le=20)
    include_tasks: bool = True
    max_document_contexts: int = Field(5, ge=1, le=10)
    max_task_contexts: int = Field(5, ge=0, le=20)


class AssistantCitation(BaseModel):
    source_type: Literal["document", "task"]
    source_id: str
    label: str
    title: str
    score: float | None = None
    excerpt: str | None = None
    url: str | None = None


class AssistantQueryResponse(BaseModel):
    query: str
    answer: str
    citations: list[AssistantCitation] = Field(default_factory=list)
    documents: list[SearchDocumentHit] = Field(default_factory=list)
    tasks: list[SearchTaskHit] = Field(default_factory=list)


class TaskSyncRequest(BaseModel):
    project_ids: list[int] = Field(default_factory=list)
    include_archived: bool = False


class TaskSyncResponse(BaseModel):
    synced_projects: int
    synced_tasks: int


class TaskActionResponse(BaseModel):
    external_task_id: str
    title: str
    status: str
    due_at: datetime | None = None
    priority: int | None = None
    project_id: str | None = None


class TaskListRequest(BaseModel):
    statuses: list[str] = Field(default_factory=lambda: ["open"])
    due_before: datetime | None = None
    due_after: datetime | None = None
    project_ids: list[str] = Field(default_factory=list)
    limit: int = Field(20, ge=1, le=100)


class TaskListItem(BaseModel):
    external_task_id: str
    project_id: str | None = None
    title: str
    description: str | None = None
    status: str
    due_at: datetime | None = None
    priority: int | None = None
    updated_at: datetime


class TaskListResponse(BaseModel):
    tasks: list[TaskListItem] = Field(default_factory=list)


class TaskScheduleResponse(BaseModel):
    generated_at: datetime
    overdue: list[TaskListItem] = Field(default_factory=list)
    today: list[TaskListItem] = Field(default_factory=list)
    next_7_days: list[TaskListItem] = Field(default_factory=list)
    later: list[TaskListItem] = Field(default_factory=list)
    unscheduled: list[TaskListItem] = Field(default_factory=list)


class TopicCandidatePayload(BaseModel):
    name: str = Field(..., min_length=1)
    confidence: float | None = Field(None, ge=0.0, le=1.0)
    origin: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class WebEnrichmentRequest(BaseModel):
    topics: list[TopicCandidatePayload] = Field(default_factory=list)
    queries: list[str] = Field(default_factory=list)
    source_document_ids: list[str] = Field(default_factory=list)
    source_revision_ids: list[str] = Field(default_factory=list)
    freshness_days: int | None = Field(None, ge=1, le=3650)
    max_results: int = Field(10, ge=1, le=50)
    allow_domains: list[str] = Field(default_factory=list)
    notes: str | None = None


class WebEnrichmentJob(BaseModel):
    job_id: str
    topic_id: str | None = None
    topic_name: str | None = None
    status: str


class WebEnrichmentResponse(BaseModel):
    queued_jobs: list[WebEnrichmentJob] = Field(default_factory=list)


class MailCoverageDay(BaseModel):
    day: str
    count: int


class MailCoverageDocument(BaseModel):
    document_id: str
    title: str
    message_day: str | None = None
    message_date_raw: str | None = None
    source_modified_label: str | None = None
    ingested_at: datetime


class MailCoverageResponse(BaseModel):
    total_email_documents: int
    covered_days_count: int
    undated_email_documents: int = 0
    earliest_message_day: str | None = None
    latest_message_day: str | None = None
    days: list[MailCoverageDay] = Field(default_factory=list)
    recent_documents: list[MailCoverageDocument] = Field(default_factory=list)


class LlmUsagePeriod(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    calls: int


class LlmUsageSummary(BaseModel):
    today: LlmUsagePeriod
    this_month: LlmUsagePeriod
    all_time: LlmUsagePeriod
    quota_monthly_tokens: int | None = None
    quota_remaining_tokens: int | None = None


class MailCoverageSummary(BaseModel):
    total_email_documents: int
    covered_days_count: int
    undated_email_documents: int = 0
    earliest_message_day: str | None = None
    latest_message_day: str | None = None


class StatusResponse(BaseModel):
    status: str
    database: str
    environment: str
    mail_coverage: MailCoverageSummary
    llm_usage: LlmUsageSummary


class LlmUsageLogRequest(BaseModel):
    model: str
    endpoint: str
    prompt_tokens: int = Field(ge=0)
    completion_tokens: int = Field(ge=0)
    total_tokens: int = Field(ge=0)


class MeetingTranscriptLinePayload(BaseModel):
    timestamp: str | None = None
    speaker: str | None = None
    text: str = Field(..., min_length=1)


class MeetingActionItemPayload(BaseModel):
    title: str | None = None
    task: str | None = None
    description: str | None = None
    owner: str | None = None
    assignee: str | None = None
    due_at: str | None = None
    deadline: str | None = None
    priority: int | None = None
    status: str | None = None
    project: str | None = None
    external_id: str | None = None


class MeetingDecisionPayload(BaseModel):
    decision: str
    rationale: str | None = None
    timestamp: str | None = None


class MeetingSlidePayload(BaseModel):
    timestamp: str | None = None
    text: str | None = None
    title: str | None = None


class MeetingIntakeRequest(BaseModel):
    source_type: SourceType = "manual_upload"
    external_id: str = Field(..., min_length=1)
    title: str | None = None
    meeting_date: str | None = None
    duration: str | None = None
    project: str | None = None
    project_id: int | None = None
    source_url: str | None = None
    participants: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    transcript: str | None = None
    transcript_lines: list[MeetingTranscriptLinePayload] = Field(default_factory=list)
    summary: str | None = None
    action_items: list[MeetingActionItemPayload] = Field(default_factory=list)
    decisions: list[MeetingDecisionPayload] = Field(default_factory=list)
    slides: list[MeetingSlidePayload] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    skip_if_checksum_matches: bool = True
    auto_sync_tasks: bool = True


class MeetingIntakeResponse(BaseModel):
    status: Literal["ingested", "deduplicated"]
    source_id: str
    document_id: str
    revision_id: str
    processing_version: int
    action_items_detected: int
    mirrored_tasks: int
    vikunja_synced: int = 0
    sync_errors: list[str] = Field(default_factory=list)


class MeetingQueryRequest(BaseModel):
    limit: int = Field(25, ge=1, le=100)
    date_from: str | None = None
    date_to: str | None = None
    category: str | None = None
    project: str | None = None
    sync_status: Literal["pending", "partial", "synced", "no_actions"] | None = None
    search_text: str | None = None


class MeetingQueryItem(BaseModel):
    document_id: str
    revision_id: str
    title: str
    summary: str | None = None
    category: str | None = None
    priority: str | None = None
    project: str | None = None
    meeting_day: str | None = None
    action_items_count: int = 0
    mirrored_tasks_count: int = 0
    open_tasks_count: int = 0
    latest_due_at: datetime | None = None
    sync_status: Literal["pending", "partial", "synced", "no_actions"] = "pending"
    updated_at: datetime


class MeetingQueryResponse(BaseModel):
    meetings: list[MeetingQueryItem] = Field(default_factory=list)


class MeetingTaskRebuildRequest(BaseModel):
    project_id: int | None = None


class MeetingTaskRebuildResponse(BaseModel):
    document_id: str
    revision_id: str
    action_items_detected: int
    mirrored_tasks: int
    vikunja_synced: int = 0
    sync_errors: list[str] = Field(default_factory=list)


class MeetingBulkSyncRequest(BaseModel):
    limit: int = Field(20, ge=1, le=200)
    date_from: str | None = None
    date_to: str | None = None
    project_id: int | None = None


class MeetingBulkSyncItem(BaseModel):
    document_id: str
    title: str
    action_items_detected: int
    mirrored_tasks: int
    vikunja_synced: int
    sync_errors: list[str] = Field(default_factory=list)


class MeetingBulkSyncResponse(BaseModel):
    processed: int
    synced: int
    with_errors: int
    items: list[MeetingBulkSyncItem] = Field(default_factory=list)


class DashboardOpenTask(BaseModel):
    title: str
    due_at: datetime | None = None
    priority: int | None = None
    project_id: str | None = None
    status: str = "open"


class DashboardRecentDocument(BaseModel):
    title: str
    created_at: datetime | None = None
    message_day: str | None = None
    source_modified_label: str | None = None
    summary: str | None = None
    category: str | None = None
    priority: str | None = None


class DashboardCategoryCount(BaseModel):
    category: str
    count: int


class DashboardMeetingMetrics(BaseModel):
    total_meeting_documents: int = 0
    meetings_last_30_days: int = 0
    action_items_total: int = 0
    mirrored_tasks_total: int = 0
    open_tasks_total: int = 0
    vikunja_synced_tasks_total: int = 0
    pending_sync_meetings: int = 0


class DashboardOverviewResponse(BaseModel):
    environment: str
    mail_coverage: MailCoverageResponse
    llm_usage: LlmUsageSummary
    open_tasks: list[DashboardOpenTask] = Field(default_factory=list)
    recent_documents: list[DashboardRecentDocument] = Field(default_factory=list)
    top_categories: list[DashboardCategoryCount] = Field(default_factory=list)
    meeting_metrics: DashboardMeetingMetrics = Field(default_factory=DashboardMeetingMetrics)
