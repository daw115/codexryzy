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


class IngestDocumentResponse(BaseModel):
    status: Literal["ingested", "deduplicated"]
    source_id: str
    document_id: str
    revision_id: str
    processing_version: int
    stored_chunks: int
    mirrored_tasks: int


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
    ingested_at: datetime


class MailCoverageResponse(BaseModel):
    total_email_documents: int
    covered_days_count: int
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
    earliest_message_day: str | None = None
    latest_message_day: str | None = None


class StatusResponse(BaseModel):
    status: str
    database: str
    environment: str
    mail_coverage: MailCoverageSummary
    llm_usage: LlmUsageSummary
