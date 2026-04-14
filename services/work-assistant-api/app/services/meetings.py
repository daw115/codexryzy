from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Any

import httpx
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from app.clients.chat_completions import ChatCompletionsClient, CompletionResult
from app.clients.embeddings import EmbeddingClient
from app.clients.vikunja import VikunjaClient
from app.schemas import (
    DocumentAnalysisPayload,
    DocumentChunkPayload,
    IngestDocumentRequest,
    MeetingBulkSyncItem,
    MeetingBulkSyncRequest,
    MeetingBulkSyncResponse,
    MeetingIntakeRequest,
    MeetingIntakeResponse,
    MeetingQueryItem,
    MeetingQueryRequest,
    MeetingQueryResponse,
    MeetingTaskRebuildRequest,
    MeetingTaskRebuildResponse,
    TaskActionResponse,
    TaskMirrorPayload,
    LlmUsageLogRequest,
)
from app.services.ingest import ingest_document
from app.services.usage import record_llm_usage


@dataclass
class NormalizedMeeting:
    source_type: str
    external_id: str
    title: str
    meeting_day: str | None
    meeting_date_raw: str | None
    project: str | None
    project_id: int | None
    source_url: str | None
    participants: list[str]
    tags: list[str]
    transcript: str
    summary: str | None
    action_items: list[dict[str, Any]]
    decisions: list[dict[str, Any]]
    slides: list[dict[str, Any]]
    metadata: dict[str, Any]


async def intake_meeting(
    *,
    pool: AsyncConnectionPool,
    payload: MeetingIntakeRequest,
    vector_dimensions: int,
    embedding_client: EmbeddingClient,
    chat_client: ChatCompletionsClient,
    vikunja_client: VikunjaClient,
    default_project_id: int | None,
) -> MeetingIntakeResponse:
    meeting = _normalize_meeting(payload)
    extracted_text = _build_meeting_document_text(meeting)
    analysis = await _analyze_meeting(
        pool=pool,
        meeting=meeting,
        extracted_text=extracted_text,
        chat_client=chat_client,
    )
    chunks = await _build_chunks(
        extracted_text=extracted_text,
        embedding_client=embedding_client,
        target_dimensions=vector_dimensions,
    )
    tasks = _build_task_payloads(
        external_id=meeting.external_id,
        action_items=analysis.action_items,
        fallback_project=meeting.project,
        explicit_project_id=meeting.project_id,
        priority_hint=analysis.priority,
    )

    checksum = _build_meeting_checksum(meeting=meeting, extracted_text=extracted_text)
    ingest_payload = IngestDocumentRequest(
        source_type=meeting.source_type,  # type: ignore[arg-type]
        external_id=meeting.external_id,
        checksum=checksum,
        title=meeting.title,
        mime_type="text/markdown",
        raw_storage_url=meeting.source_url,
        extracted_text=extracted_text,
        normalized_text=extracted_text,
        source_metadata={
            "source": "meeting_intake_gateway",
            "participants": meeting.participants,
            "tags": meeting.tags,
            "meeting_date_raw": meeting.meeting_date_raw,
        },
        document_metadata={
            "artifact_type": "meeting_analysis",
            "meeting_date_day": meeting.meeting_day,
            "project": meeting.project,
            "source_url": meeting.source_url,
            "participants_count": len(meeting.participants),
            "tags": meeting.tags,
            "sync_policy": "auto_all",
            **meeting.metadata,
        },
        analysis=analysis,
        chunks=chunks,
        tasks=tasks,
        skip_if_checksum_matches=payload.skip_if_checksum_matches,
        auto_sync_tasks=payload.auto_sync_tasks,
    )

    ingest_result = await ingest_document(
        pool=pool,
        payload=ingest_payload,
        vector_dimensions=vector_dimensions,
    )

    vikunja_synced = 0
    sync_errors: list[str] = []
    if payload.auto_sync_tasks:
        vikunja_synced, sync_errors = await sync_document_tasks_to_vikunja(
            pool=pool,
            vikunja_client=vikunja_client,
            document_id=ingest_result.document_id,
            revision_id=ingest_result.revision_id,
            default_project_id=default_project_id,
            force_project_id=meeting.project_id,
        )

    return MeetingIntakeResponse(
        status=ingest_result.status,
        source_id=ingest_result.source_id,
        document_id=ingest_result.document_id,
        revision_id=ingest_result.revision_id,
        processing_version=ingest_result.processing_version,
        action_items_detected=len(analysis.action_items),
        mirrored_tasks=ingest_result.mirrored_tasks,
        vikunja_synced=vikunja_synced,
        sync_errors=sync_errors,
    )


async def query_meetings(
    *,
    pool: AsyncConnectionPool,
    payload: MeetingQueryRequest,
) -> MeetingQueryResponse:
    filters = [
        "COALESCE(d.metadata->>'artifact_type', r.metadata->>'artifact_type') = 'meeting_analysis'",
    ]
    params: list[Any] = []

    date_from = _normalize_day(payload.date_from)
    date_to = _normalize_day(payload.date_to)
    if date_from:
        filters.append("COALESCE(d.metadata->>'meeting_date_day', r.metadata->>'meeting_date_day') >= %s")
        params.append(date_from)
    if date_to:
        filters.append("COALESCE(d.metadata->>'meeting_date_day', r.metadata->>'meeting_date_day') <= %s")
        params.append(date_to)
    if payload.category:
        filters.append("la.category = %s")
        params.append(payload.category)
    if payload.project:
        filters.append("d.metadata->>'project' = %s")
        params.append(payload.project)
    if payload.search_text:
        filters.append(
            """
            (
                setweight(to_tsvector('simple', COALESCE(d.title, '')), 'A') ||
                setweight(to_tsvector('simple', COALESCE(r.extracted_text, '')), 'B') ||
                setweight(to_tsvector('simple', COALESCE(la.summary, '')), 'C')
            ) @@ websearch_to_tsquery('simple', %s)
            """
        )
        params.append(payload.search_text)

    where_clause = " AND ".join(filters)

    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                f"""
                WITH latest_analysis AS (
                    SELECT DISTINCT ON (revision_id)
                        revision_id,
                        summary,
                        category,
                        priority,
                        action_items
                    FROM document_analyses
                    ORDER BY revision_id, created_at DESC
                )
                SELECT
                    d.id::text AS document_id,
                    r.id::text AS revision_id,
                    d.title,
                    la.summary,
                    la.category,
                    la.priority,
                    d.metadata->>'project' AS project,
                    COALESCE(d.metadata->>'meeting_date_day', r.metadata->>'meeting_date_day') AS meeting_day,
                    COALESCE(jsonb_array_length(COALESCE(la.action_items, '[]'::jsonb)), 0) AS action_items_count,
                    COUNT(tm.external_task_id)::int AS mirrored_tasks_count,
                    COUNT(tm.external_task_id) FILTER (WHERE tm.status = 'open')::int AS open_tasks_count,
                    COUNT(tm.external_task_id) FILTER (
                        WHERE LOWER(COALESCE(tm.metadata->>'vikunja_synced', 'false')) IN ('true', '1', 'yes')
                    )::int AS vikunja_synced_count,
                    MAX(tm.due_at) AS latest_due_at,
                    d.updated_at
                FROM documents d
                JOIN sources s ON s.id = d.source_id
                JOIN document_revisions r ON r.id = d.current_revision_id
                LEFT JOIN latest_analysis la ON la.revision_id = r.id
                LEFT JOIN tasks_mirror tm ON tm.source_document_id = d.id
                WHERE {where_clause}
                GROUP BY
                    d.id, r.id, d.title, la.summary, la.category, la.priority, la.action_items,
                    d.metadata, r.metadata, d.updated_at
                ORDER BY
                    COALESCE(d.metadata->>'meeting_date_day', r.metadata->>'meeting_date_day') DESC NULLS LAST,
                    d.updated_at DESC
                LIMIT %s
                """,
                (*params, payload.limit),
            )
            rows = await cursor.fetchall()

    meetings: list[MeetingQueryItem] = []
    for row in rows:
        action_items_count = int(row["action_items_count"] or 0)
        synced_count = int(row["vikunja_synced_count"] or 0)

        if action_items_count == 0:
            sync_status = "no_actions"
        elif synced_count <= 0:
            sync_status = "pending"
        elif synced_count < action_items_count:
            sync_status = "partial"
        else:
            sync_status = "synced"

        if payload.sync_status and payload.sync_status != sync_status:
            continue

        meetings.append(
            MeetingQueryItem(
                document_id=row["document_id"],
                revision_id=row["revision_id"],
                title=row["title"],
                summary=row["summary"],
                category=row["category"],
                priority=row["priority"],
                project=row["project"],
                meeting_day=row["meeting_day"],
                action_items_count=action_items_count,
                mirrored_tasks_count=int(row["mirrored_tasks_count"] or 0),
                open_tasks_count=int(row["open_tasks_count"] or 0),
                latest_due_at=row["latest_due_at"],
                sync_status=sync_status,
                updated_at=row["updated_at"],
            )
        )

    return MeetingQueryResponse(meetings=meetings)


async def rebuild_meeting_tasks(
    *,
    pool: AsyncConnectionPool,
    payload: MeetingTaskRebuildRequest,
    document_id: str,
    vikunja_client: VikunjaClient,
    default_project_id: int | None,
) -> MeetingTaskRebuildResponse | None:
    context = await _load_meeting_context(pool=pool, document_id=document_id)
    if not context:
        return None

    action_items = _normalize_action_items(
        _coerce_dict_list(context.get("action_items")),
        default_project=context.get("project"),
    )
    tasks = _build_task_payloads(
        external_id=context["external_id"],
        action_items=action_items,
        fallback_project=context.get("project"),
        explicit_project_id=payload.project_id or context.get("project_id"),
        priority_hint=context.get("priority"),
    )

    mirrored_tasks = await _upsert_task_payloads(
        pool=pool,
        tasks=tasks,
        document_id=context["document_id"],
        revision_id=context["revision_id"],
    )

    vikunja_synced = 0
    sync_errors: list[str] = []
    if tasks:
        vikunja_synced, sync_errors = await sync_document_tasks_to_vikunja(
            pool=pool,
            vikunja_client=vikunja_client,
            document_id=context["document_id"],
            revision_id=context["revision_id"],
            default_project_id=default_project_id,
            force_project_id=payload.project_id or context.get("project_id"),
        )

    return MeetingTaskRebuildResponse(
        document_id=context["document_id"],
        revision_id=context["revision_id"],
        action_items_detected=len(action_items),
        mirrored_tasks=mirrored_tasks,
        vikunja_synced=vikunja_synced,
        sync_errors=sync_errors,
    )


async def bulk_sync_pending_meetings(
    *,
    pool: AsyncConnectionPool,
    payload: MeetingBulkSyncRequest,
    vikunja_client: VikunjaClient,
    default_project_id: int | None,
) -> MeetingBulkSyncResponse:
    candidates = await _load_pending_meeting_documents(
        pool=pool,
        limit=payload.limit,
        date_from=payload.date_from,
        date_to=payload.date_to,
    )

    items: list[MeetingBulkSyncItem] = []
    synced_total = 0
    error_count = 0
    for candidate in candidates:
        rebuilt = await rebuild_meeting_tasks(
            pool=pool,
            payload=MeetingTaskRebuildRequest(project_id=payload.project_id),
            document_id=candidate["document_id"],
            vikunja_client=vikunja_client,
            default_project_id=default_project_id,
        )
        if rebuilt is None:
            continue
        synced_total += rebuilt.vikunja_synced
        has_errors = bool(rebuilt.sync_errors)
        if has_errors:
            error_count += 1
        items.append(
            MeetingBulkSyncItem(
                document_id=rebuilt.document_id,
                title=candidate["title"],
                action_items_detected=rebuilt.action_items_detected,
                mirrored_tasks=rebuilt.mirrored_tasks,
                vikunja_synced=rebuilt.vikunja_synced,
                sync_errors=rebuilt.sync_errors,
            )
        )

    return MeetingBulkSyncResponse(
        processed=len(items),
        synced=synced_total,
        with_errors=error_count,
        items=items,
    )


async def complete_meeting_task(
    *,
    pool: AsyncConnectionPool,
    external_task_id: str,
    vikunja_client: VikunjaClient,
) -> TaskActionResponse:
    if not vikunja_client.enabled:
        raise RuntimeError("VIKUNJA_URL and VIKUNJA_API_TOKEN must be configured")

    task_row = await _load_mirror_task(pool=pool, external_task_id=external_task_id)
    if not task_row:
        raise ValueError("Task not found")

    metadata = task_row["metadata"] or {}
    vikunja_task_id = _parse_int(metadata.get("vikunja_task_id"))
    if vikunja_task_id is None and task_row["external_task_id"].isdigit():
        vikunja_task_id = int(task_row["external_task_id"])
    if vikunja_task_id is None:
        raise ValueError("Task is not linked to Vikunja")

    current = await vikunja_client.get_task(vikunja_task_id)
    updated = await vikunja_client.update_task(
        vikunja_task_id,
        body=_build_vikunja_update_payload(current=current, task_row=task_row, done=True),
    )

    await _update_mirror_after_vikunja_sync(
        pool=pool,
        external_task_id=external_task_id,
        synced_task=updated,
        inherited_metadata=metadata,
    )
    return TaskActionResponse(
        external_task_id=external_task_id,
        title=updated.get("title") or task_row["title"],
        status="done" if updated.get("done") else "open",
        due_at=_parse_timestamp(updated.get("due_date")),
        priority=updated.get("priority"),
        project_id=str(updated.get("project_id")) if updated.get("project_id") is not None else None,
    )


async def sync_document_tasks_to_vikunja(
    *,
    pool: AsyncConnectionPool,
    vikunja_client: VikunjaClient,
    document_id: str,
    revision_id: str | None = None,
    default_project_id: int | None = None,
    force_project_id: int | None = None,
) -> tuple[int, list[str]]:
    task_rows = await _load_document_tasks(
        pool=pool,
        document_id=document_id,
        revision_id=revision_id,
    )
    if not task_rows:
        return 0, []

    if not vikunja_client.enabled:
        return 0, ["VIKUNJA_URL and VIKUNJA_API_TOKEN are not configured"]

    synced = 0
    errors: list[str] = []

    for task_row in task_rows:
        metadata = task_row["metadata"] or {}
        try:
            project_id = (
                force_project_id
                or _parse_int(task_row.get("external_project_id"))
                or _parse_int(metadata.get("project_id"))
                or default_project_id
            )
            if project_id is None:
                raise ValueError(f"No Vikunja project id for task '{task_row['title']}'")

            vikunja_task_id = _parse_int(metadata.get("vikunja_task_id"))
            if vikunja_task_id is None and task_row["external_task_id"].isdigit():
                vikunja_task_id = int(task_row["external_task_id"])

            synced_task: dict[str, Any]
            if vikunja_task_id is not None:
                try:
                    current = await vikunja_client.get_task(vikunja_task_id)
                    synced_task = await vikunja_client.update_task(
                        vikunja_task_id,
                        body=_build_vikunja_update_payload(current=current, task_row=task_row, done=None),
                    )
                except httpx.HTTPStatusError as error:
                    if error.response.status_code != 404:
                        raise
                    synced_task = await vikunja_client.create_project_task(
                        project_id,
                        body=_build_vikunja_create_payload(task_row=task_row, project_id=project_id),
                    )
            else:
                synced_task = await vikunja_client.create_project_task(
                    project_id,
                    body=_build_vikunja_create_payload(task_row=task_row, project_id=project_id),
                )

            await _update_mirror_after_vikunja_sync(
                pool=pool,
                external_task_id=task_row["external_task_id"],
                synced_task=synced_task,
                inherited_metadata=metadata,
            )
            synced += 1
        except Exception as error:
            errors.append(f"{task_row['external_task_id']}: {error}")

    return synced, errors


async def _load_meeting_context(
    *,
    pool: AsyncConnectionPool,
    document_id: str,
) -> dict[str, Any] | None:
    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                WITH latest_analysis AS (
                    SELECT DISTINCT ON (revision_id)
                        revision_id,
                        action_items,
                        priority
                    FROM document_analyses
                    ORDER BY revision_id, created_at DESC
                )
                SELECT
                    d.id::text AS document_id,
                    r.id::text AS revision_id,
                    s.external_id,
                    d.metadata AS document_metadata,
                    d.metadata->>'project' AS project,
                    la.action_items,
                    la.priority
                FROM documents d
                JOIN sources s ON s.id = d.source_id
                JOIN document_revisions r ON r.id = d.current_revision_id
                LEFT JOIN latest_analysis la ON la.revision_id = r.id
                WHERE
                    d.id = %s::uuid
                    AND COALESCE(d.metadata->>'artifact_type', r.metadata->>'artifact_type') = 'meeting_analysis'
                LIMIT 1
                """,
                (document_id,),
            )
            row = await cursor.fetchone()
    if not row:
        return None

    metadata = row["document_metadata"] or {}
    return {
        "document_id": row["document_id"],
        "revision_id": row["revision_id"],
        "external_id": row["external_id"],
        "project": row["project"],
        "project_id": _parse_int(metadata.get("project_id")),
        "action_items": row["action_items"] or [],
        "priority": row["priority"],
    }


async def _load_pending_meeting_documents(
    *,
    pool: AsyncConnectionPool,
    limit: int,
    date_from: str | None,
    date_to: str | None,
) -> list[dict[str, Any]]:
    filters = ["COALESCE(d.metadata->>'artifact_type', r.metadata->>'artifact_type') = 'meeting_analysis'"]
    params: list[Any] = []
    normalized_from = _normalize_day(date_from)
    normalized_to = _normalize_day(date_to)
    if normalized_from:
        filters.append("COALESCE(d.metadata->>'meeting_date_day', r.metadata->>'meeting_date_day') >= %s")
        params.append(normalized_from)
    if normalized_to:
        filters.append("COALESCE(d.metadata->>'meeting_date_day', r.metadata->>'meeting_date_day') <= %s")
        params.append(normalized_to)

    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                f"""
                WITH latest_analysis AS (
                    SELECT DISTINCT ON (revision_id)
                        revision_id,
                        action_items
                    FROM document_analyses
                    ORDER BY revision_id, created_at DESC
                ),
                task_rollup AS (
                    SELECT
                        tm.source_document_id,
                        COUNT(*) FILTER (
                            WHERE LOWER(COALESCE(tm.metadata->>'vikunja_synced', 'false')) IN ('true', '1', 'yes')
                        )::int AS synced_tasks_count
                    FROM tasks_mirror tm
                    WHERE tm.source_document_id IS NOT NULL
                    GROUP BY tm.source_document_id
                )
                SELECT
                    d.id::text AS document_id,
                    d.title,
                    COALESCE(jsonb_array_length(COALESCE(la.action_items, '[]'::jsonb)), 0) AS action_items_count,
                    COALESCE(tr.synced_tasks_count, 0) AS synced_tasks_count
                FROM documents d
                JOIN document_revisions r ON r.id = d.current_revision_id
                LEFT JOIN latest_analysis la ON la.revision_id = r.id
                LEFT JOIN task_rollup tr ON tr.source_document_id = d.id
                WHERE {' AND '.join(filters)}
                ORDER BY d.updated_at DESC
                LIMIT %s
                """,
                (*params, limit),
            )
            rows = await cursor.fetchall()

    return [
        {
            "document_id": row["document_id"],
            "title": row["title"],
        }
        for row in rows
        if int(row["action_items_count"] or 0) > 0
        and int(row["synced_tasks_count"] or 0) < int(row["action_items_count"] or 0)
    ]


def _normalize_meeting(payload: MeetingIntakeRequest) -> NormalizedMeeting:
    external_id = _clean_string(payload.external_id)
    if not external_id:
        raise ValueError("external_id is required")

    title = _clean_string(payload.title) or f"Meeting {external_id}"
    meeting_day = _normalize_day(payload.meeting_date)
    project = _clean_string(payload.project)
    project_id = payload.project_id if payload.project_id and payload.project_id > 0 else None
    source_url = _clean_string(payload.source_url)

    participants = _dedupe_strings(payload.participants)
    tags = _dedupe_strings(payload.tags)

    transcript = _clean_string(payload.transcript) or _render_transcript_lines(payload.transcript_lines)
    summary = _clean_string(payload.summary)
    decisions = _normalize_decisions(payload.decisions)
    slides = _normalize_slides(payload.slides)
    action_items = _normalize_action_items(_coerce_dict_list(payload.action_items), default_project=project)

    if not transcript and not summary and not action_items and not decisions:
        raise ValueError("Meeting payload must include transcript, summary, action_items or decisions")

    return NormalizedMeeting(
        source_type=payload.source_type,
        external_id=external_id,
        title=title,
        meeting_day=meeting_day,
        meeting_date_raw=_clean_string(payload.meeting_date),
        project=project,
        project_id=project_id,
        source_url=source_url,
        participants=participants,
        tags=tags,
        transcript=transcript or "",
        summary=summary,
        action_items=action_items,
        decisions=decisions,
        slides=slides,
        metadata=payload.metadata or {},
    )


def _build_meeting_document_text(meeting: NormalizedMeeting) -> str:
    lines: list[str] = [
        f"# {meeting.title}",
        "",
        f"Meeting ID: {meeting.external_id}",
    ]
    if meeting.meeting_day:
        lines.append(f"Date: {meeting.meeting_day}")
    elif meeting.meeting_date_raw:
        lines.append(f"Date raw: {meeting.meeting_date_raw}")
    if meeting.project:
        lines.append(f"Project: {meeting.project}")
    if meeting.source_url:
        lines.append(f"Source URL: {meeting.source_url}")
    if meeting.participants:
        lines.extend(["", "## Participants", ", ".join(meeting.participants)])
    if meeting.tags:
        lines.extend(["", "## Tags", ", ".join(meeting.tags)])
    if meeting.summary:
        lines.extend(["", "## Provided Summary", meeting.summary])
    if meeting.transcript:
        lines.extend(["", "## Transcript", meeting.transcript])
    if meeting.action_items:
        lines.extend(["", "## Action Items (provided)"])
        for item in meeting.action_items:
            owner = _clean_string(item.get("owner")) or "unassigned"
            due_at = _clean_string(item.get("due_at")) or "no due date"
            lines.append(f"- {item['title']} | owner={owner} | due={due_at}")
    if meeting.decisions:
        lines.extend(["", "## Decisions"])
        for item in meeting.decisions:
            decision = _clean_string(item.get("decision"))
            rationale = _clean_string(item.get("rationale"))
            if decision:
                lines.append(f"- {decision}" + (f" (rationale: {rationale})" if rationale else ""))
    if meeting.slides:
        lines.extend(["", "## Slides"])
        for slide in meeting.slides:
            title = _clean_string(slide.get("title"))
            text = _clean_string(slide.get("text"))
            if title or text:
                lines.append(f"- {title or '(untitled)'}: {text or ''}".strip())

    return "\n".join(lines).strip()


def _build_meeting_checksum(*, meeting: NormalizedMeeting, extracted_text: str) -> str:
    payload = {
        "external_id": meeting.external_id,
        "meeting_day": meeting.meeting_day,
        "project": meeting.project,
        "participants": meeting.participants,
        "tags": meeting.tags,
        "text": extracted_text,
    }
    serialized = json.dumps(payload, ensure_ascii=True, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


async def _analyze_meeting(
    *,
    pool: AsyncConnectionPool,
    meeting: NormalizedMeeting,
    extracted_text: str,
    chat_client: ChatCompletionsClient,
) -> DocumentAnalysisPayload:
    if not chat_client.enabled:
        return _fallback_analysis(meeting=meeting, model="meeting_fallback")

    system_prompt = (
        "You are a meeting intelligence engine. Return one strict JSON object and nothing else. "
        "Schema: {"
        "\"summary\": string, "
        "\"category\": string, "
        "\"priority\": \"urgent\"|\"high\"|\"normal\"|\"low\", "
        "\"action_items\": [{\"title\": string, \"description\": string|null, \"owner\": string|null, "
        "\"due_at\": string|null, \"priority\": number|null, \"status\": string|null, \"project\": string|null}], "
        "\"entities\": [{\"name\": string, \"type\": string|null}], "
        "\"deadlines\": [{\"label\": string, \"date\": string|null, \"owner\": string|null}], "
        "\"open_questions\": [string]"
        "}."
    )
    user_prompt = (
        "Analyze this meeting and extract operational output for task execution.\n"
        "If data is missing, use null. Never hallucinate names or dates.\n\n"
        f"{extracted_text[:16000]}"
    )

    try:
        result = await chat_client.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.0,
            max_tokens=1800,
        )
        await _record_usage(pool=pool, result=result, endpoint="meeting_pipeline")
        parsed = _extract_json(result.text)
        return _coerce_analysis(
            meeting=meeting,
            parsed=parsed,
            model=result.model or chat_client.model,
        )
    except Exception:
        return _fallback_analysis(meeting=meeting, model=chat_client.model or "meeting_fallback")


def _fallback_analysis(*, meeting: NormalizedMeeting, model: str) -> DocumentAnalysisPayload:
    summary = meeting.summary or "Brak pełnego streszczenia. Wymagana ręczna weryfikacja."
    deadlines = []
    for item in meeting.action_items:
        if _clean_string(item.get("due_at")):
            deadlines.append(
                {
                    "label": item.get("title"),
                    "date": item.get("due_at"),
                    "owner": item.get("owner"),
                }
            )

    return DocumentAnalysisPayload(
        model=model,
        prompt_version="meeting-single-pass-v1",
        summary=summary,
        category=meeting.project or "meeting",
        priority="normal",
        confidence=0.55,
        action_items=meeting.action_items,
        entities=[{"name": participant, "type": "person"} for participant in meeting.participants],
        deadlines=deadlines,
        open_questions=[],
        metadata={
            "pipeline": "meeting_pipeline",
            "analysis_mode": "fallback",
        },
    )


def _coerce_analysis(
    *,
    meeting: NormalizedMeeting,
    parsed: dict[str, Any],
    model: str,
) -> DocumentAnalysisPayload:
    summary = _clean_string(parsed.get("summary")) or meeting.summary
    if not summary:
        summary = "Brak jednoznacznego podsumowania."
    category = _clean_string(parsed.get("category")) or meeting.project or "meeting"
    priority = _normalize_priority_label(parsed.get("priority")) or "normal"
    action_items = _normalize_action_items(_coerce_dict_list(parsed.get("action_items")), default_project=meeting.project)
    if not action_items:
        action_items = meeting.action_items
    entities = _normalize_entities(_coerce_dict_list(parsed.get("entities")), participants=meeting.participants)
    deadlines = _normalize_deadlines(
        _coerce_dict_list(parsed.get("deadlines")),
        action_items=action_items,
    )
    open_questions = _coerce_string_list(parsed.get("open_questions"))

    return DocumentAnalysisPayload(
        model=model,
        prompt_version="meeting-single-pass-v1",
        summary=summary,
        category=category,
        priority=priority,
        confidence=0.8 if parsed.get("summary") else 0.6,
        action_items=action_items,
        entities=entities,
        deadlines=deadlines,
        open_questions=open_questions,
        metadata={
            "pipeline": "meeting_pipeline",
            "analysis_mode": "quatarly_single_pass",
        },
    )


async def _record_usage(
    *,
    pool: AsyncConnectionPool,
    result: CompletionResult,
    endpoint: str,
) -> None:
    try:
        await record_llm_usage(
            pool=pool,
            payload=LlmUsageLogRequest(
                model=result.model,
                endpoint=endpoint,
                prompt_tokens=result.prompt_tokens,
                completion_tokens=result.completion_tokens,
                total_tokens=result.total_tokens,
            ),
        )
    except Exception:
        pass


async def _build_chunks(
    *,
    extracted_text: str,
    embedding_client: EmbeddingClient,
    target_dimensions: int,
) -> list[DocumentChunkPayload]:
    chunks: list[DocumentChunkPayload] = []
    for index, content in enumerate(_chunk_text(extracted_text)):
        embedding = None
        try:
            embedding = await embedding_client.embed_text(content)
        except Exception:
            embedding = None
        if embedding is not None and len(embedding) != target_dimensions:
            embedding = None
        chunks.append(
            DocumentChunkPayload(
                chunk_index=index,
                content=content,
                token_count=max(1, len(content) // 4),
                embedding=embedding,
                metadata={"artifact_type": "meeting_analysis"},
            )
        )
    return chunks


def _build_task_payloads(
    *,
    external_id: str,
    action_items: list[dict[str, Any]],
    fallback_project: str | None,
    explicit_project_id: int | None,
    priority_hint: str | None,
) -> list[TaskMirrorPayload]:
    tasks: list[TaskMirrorPayload] = []
    for index, action in enumerate(action_items):
        title = _clean_string(action.get("title")) or _clean_string(action.get("task"))
        if not title:
            continue

        owner = _clean_string(action.get("owner")) or _clean_string(action.get("assignee"))
        due_raw = _clean_string(action.get("due_at")) or _clean_string(action.get("deadline"))
        due_at = _parse_timestamp(due_raw)
        priority = _normalize_priority_value(action.get("priority"), priority_hint=priority_hint)
        status = _normalize_status(action.get("status"))
        project = _clean_string(action.get("project")) or fallback_project

        hash_source = "|".join([external_id, title, owner or "", due_raw or "", str(index)])
        deterministic_id = f"meeting:{external_id}:{hashlib.sha1(hash_source.encode('utf-8')).hexdigest()[:16]}"
        tasks.append(
            TaskMirrorPayload(
                external_task_id=deterministic_id,
                external_project_id=str(explicit_project_id) if explicit_project_id else None,
                title=title,
                description=_clean_string(action.get("description")),
                due_at=due_at,
                priority=priority,
                status=status,
                metadata={
                    "source": "meeting_analysis",
                    "owner": owner,
                    "project": project,
                    "due_at_raw": due_raw,
                    "task_fingerprint": deterministic_id,
                },
            )
        )
    return tasks


async def _upsert_task_payloads(
    *,
    pool: AsyncConnectionPool,
    tasks: list[TaskMirrorPayload],
    document_id: str,
    revision_id: str,
) -> int:
    if not tasks:
        return 0

    mirrored = 0
    async with pool.connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                for task in tasks:
                    await cursor.execute(
                        """
                        INSERT INTO tasks_mirror (
                            external_task_id,
                            external_project_id,
                            source_document_id,
                            source_revision_id,
                            title,
                            description,
                            due_at,
                            priority,
                            status,
                            metadata,
                            synced_at,
                            created_at,
                            updated_at
                        )
                        VALUES (%s, %s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())
                        ON CONFLICT (external_task_id)
                        DO UPDATE SET
                            external_project_id = EXCLUDED.external_project_id,
                            source_document_id = EXCLUDED.source_document_id,
                            source_revision_id = EXCLUDED.source_revision_id,
                            title = EXCLUDED.title,
                            description = EXCLUDED.description,
                            due_at = EXCLUDED.due_at,
                            priority = EXCLUDED.priority,
                            status = EXCLUDED.status,
                            metadata = COALESCE(tasks_mirror.metadata, '{}'::jsonb) || EXCLUDED.metadata,
                            synced_at = NOW(),
                            updated_at = NOW()
                        """,
                        (
                            task.external_task_id,
                            task.external_project_id,
                            document_id,
                            revision_id,
                            task.title,
                            task.description,
                            task.due_at,
                            task.priority,
                            task.status,
                            Jsonb(task.metadata),
                        ),
                    )
                    mirrored += 1
    return mirrored


async def _load_document_tasks(
    *,
    pool: AsyncConnectionPool,
    document_id: str,
    revision_id: str | None,
) -> list[dict[str, Any]]:
    where = ["source_document_id = %s::uuid"]
    params: list[Any] = [document_id]
    if revision_id:
        where.append("source_revision_id = %s::uuid")
        params.append(revision_id)

    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                f"""
                SELECT
                    external_task_id,
                    external_project_id,
                    title,
                    description,
                    due_at,
                    priority,
                    status,
                    metadata
                FROM tasks_mirror
                WHERE {' AND '.join(where)}
                ORDER BY updated_at DESC
                """,
                tuple(params),
            )
            return await cursor.fetchall()


async def _load_mirror_task(
    *,
    pool: AsyncConnectionPool,
    external_task_id: str,
) -> dict[str, Any] | None:
    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                SELECT
                    external_task_id,
                    external_project_id,
                    title,
                    description,
                    due_at,
                    priority,
                    status,
                    metadata
                FROM tasks_mirror
                WHERE external_task_id = %s
                LIMIT 1
                """,
                (external_task_id,),
            )
            return await cursor.fetchone()


def _build_vikunja_create_payload(*, task_row: dict[str, Any], project_id: int) -> dict[str, Any]:
    return {
        "title": task_row.get("title") or "",
        "description": task_row.get("description") or "",
        "done": _normalize_status(task_row.get("status")) == "done",
        "project_id": project_id,
        "due_date": _serialize_due_date(task_row.get("due_at")),
        "priority": task_row.get("priority") or 2,
        "hex_color": "",
    }


def _build_vikunja_update_payload(
    *,
    current: dict[str, Any],
    task_row: dict[str, Any],
    done: bool | None,
) -> dict[str, Any]:
    desired_done = done
    if desired_done is None:
        desired_done = _normalize_status(task_row.get("status")) == "done"
    return {
        "title": task_row.get("title") or current.get("title") or "",
        "description": task_row.get("description") or current.get("description") or "",
        "done": desired_done,
        "project_id": current.get("project_id"),
        "due_date": _serialize_due_date(task_row.get("due_at")) or current.get("due_date"),
        "priority": task_row.get("priority") or current.get("priority") or 2,
        "start_date": current.get("start_date"),
        "end_date": current.get("end_date"),
        "repeat_after": current.get("repeat_after"),
        "repeat_mode": current.get("repeat_mode"),
        "hex_color": current.get("hex_color") or "",
    }


async def _update_mirror_after_vikunja_sync(
    *,
    pool: AsyncConnectionPool,
    external_task_id: str,
    synced_task: dict[str, Any],
    inherited_metadata: dict[str, Any],
) -> None:
    project_id = synced_task.get("project_id")
    merged_metadata = {
        **inherited_metadata,
        "vikunja_task_id": synced_task.get("id"),
        "vikunja_identifier": synced_task.get("identifier"),
        "vikunja_synced": True,
        "vikunja_last_sync_at": datetime.now(timezone.utc).isoformat(),
    }

    async with pool.connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    UPDATE tasks_mirror
                    SET
                        external_project_id = COALESCE(%s, external_project_id),
                        title = %s,
                        description = %s,
                        due_at = %s,
                        priority = %s,
                        status = %s,
                        metadata = COALESCE(tasks_mirror.metadata, '{}'::jsonb) || %s,
                        synced_at = NOW(),
                        updated_at = NOW()
                    WHERE external_task_id = %s
                    """,
                    (
                        str(project_id) if project_id is not None else None,
                        synced_task.get("title") or "",
                        synced_task.get("description") or "",
                        _parse_timestamp(synced_task.get("due_date")),
                        synced_task.get("priority"),
                        "done" if synced_task.get("done") else "open",
                        Jsonb(merged_metadata),
                        external_task_id,
                    ),
                )


def _extract_json(text: str) -> dict[str, Any]:
    candidate = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", candidate, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        candidate = fenced.group(1).strip()

    for attempt in (candidate, _extract_braced_json(candidate)):
        if not attempt:
            continue
        try:
            parsed = json.loads(attempt)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    raise ValueError("Could not parse JSON from model response")


def _extract_braced_json(value: str) -> str | None:
    start = value.find("{")
    end = value.rfind("}")
    if start < 0 or end < 0 or end <= start:
        return None
    return value[start : end + 1]


def _render_transcript_lines(lines: list[Any]) -> str:
    rendered: list[str] = []
    for line in lines:
        item = _to_dict(line)
        text = _clean_string(item.get("text"))
        if not text:
            continue
        speaker = _clean_string(item.get("speaker"))
        timestamp = _clean_string(item.get("timestamp"))
        prefix = " ".join(part for part in [timestamp, speaker] if part)
        rendered.append(f"{prefix}: {text}" if prefix else text)
    return "\n".join(rendered).strip()


def _normalize_action_items(items: list[dict[str, Any]], default_project: str | None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in items:
        title = _clean_string(item.get("title")) or _clean_string(item.get("task")) or _clean_string(item.get("action"))
        if not title:
            continue
        normalized.append(
            {
                "title": title,
                "description": _clean_string(item.get("description")),
                "owner": _clean_string(item.get("owner")) or _clean_string(item.get("assignee")),
                "due_at": _clean_string(item.get("due_at")) or _clean_string(item.get("deadline")),
                "priority": _parse_int(item.get("priority")),
                "status": _normalize_status(item.get("status")),
                "project": _clean_string(item.get("project")) or default_project,
            }
        )
    return normalized


def _normalize_decisions(items: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for entry in items:
        item = _to_dict(entry)
        decision = _clean_string(item.get("decision"))
        if not decision:
            continue
        normalized.append(
            {
                "decision": decision,
                "rationale": _clean_string(item.get("rationale")),
                "timestamp": _clean_string(item.get("timestamp")),
            }
        )
    return normalized


def _normalize_slides(items: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for entry in items:
        item = _to_dict(entry)
        title = _clean_string(item.get("title"))
        text = _clean_string(item.get("text"))
        timestamp = _clean_string(item.get("timestamp"))
        if not title and not text:
            continue
        normalized.append(
            {
                "title": title,
                "text": text,
                "timestamp": timestamp,
            }
        )
    return normalized


def _normalize_entities(items: list[dict[str, Any]], participants: list[str]) -> list[dict[str, Any]]:
    entities: list[dict[str, Any]] = []
    for item in items:
        name = _clean_string(item.get("name"))
        if not name:
            continue
        entities.append({"name": name, "type": _clean_string(item.get("type"))})
    for participant in participants:
        if not any(entity["name"].lower() == participant.lower() for entity in entities):
            entities.append({"name": participant, "type": "person"})
    return entities


def _normalize_deadlines(
    items: list[dict[str, Any]],
    action_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    deadlines: list[dict[str, Any]] = []
    for item in items:
        label = _clean_string(item.get("label")) or _clean_string(item.get("title"))
        date_value = _clean_string(item.get("date")) or _clean_string(item.get("due_at"))
        if not label and not date_value:
            continue
        deadlines.append(
            {
                "label": label or "Deadline",
                "date": date_value,
                "owner": _clean_string(item.get("owner")),
            }
        )

    if deadlines:
        return deadlines

    for action in action_items:
        date_value = _clean_string(action.get("due_at"))
        if not date_value:
            continue
        deadlines.append(
            {
                "label": _clean_string(action.get("title")) or "Deadline",
                "date": date_value,
                "owner": _clean_string(action.get("owner")),
            }
        )
    return deadlines


def _chunk_text(value: str, chunk_size: int = 1400, overlap: int = 220) -> list[str]:
    text = value.strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks


def _clean_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _coerce_dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result: list[dict[str, Any]] = []
    for entry in value:
        if isinstance(entry, dict):
            result.append(entry)
        else:
            maybe = _to_dict(entry)
            if maybe:
                result.append(maybe)
    return result


def _coerce_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        text = _clean_string(item)
        if text:
            result.append(text)
    return result


def _to_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        if isinstance(dumped, dict):
            return dumped
    return {}


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        clean = _clean_string(value)
        if not clean:
            continue
        key = clean.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(clean)
    return output


def _normalize_day(raw: str | None) -> str | None:
    value = _clean_string(raw)
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.date().isoformat()
    except ValueError:
        pass

    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value

    return None


def _normalize_priority_label(value: Any) -> str | None:
    text = _clean_string(value)
    if not text:
        return None
    lowered = text.lower()
    if lowered in {"urgent", "pilne", "critical", "krytyczne"}:
        return "urgent"
    if lowered in {"high", "wysoki"}:
        return "high"
    if lowered in {"low", "niski"}:
        return "low"
    return "normal"


def _normalize_priority_value(value: Any, *, priority_hint: str | None) -> int:
    numeric = _parse_int(value)
    if numeric is not None:
        return max(0, min(5, numeric))

    hint = _normalize_priority_label(priority_hint)
    if hint == "urgent":
        return 5
    if hint == "high":
        return 4
    if hint == "low":
        return 1
    return 2


def _normalize_status(value: Any) -> str:
    text = _clean_string(value)
    if not text:
        return "open"
    lowered = text.lower()
    if lowered in {"done", "complete", "completed", "zrobione", "zamkniete", "closed"}:
        return "done"
    return "open"


def _parse_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _parse_timestamp(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    text = _clean_string(value)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        pass

    normalized_day = _normalize_day(text)
    if normalized_day:
        parsed_day = date.fromisoformat(normalized_day)
        return datetime.combine(parsed_day, time.min, tzinfo=timezone.utc)
    return None


def _serialize_due_date(value: Any) -> str | None:
    parsed = _parse_timestamp(value)
    if not parsed:
        return None
    return parsed.astimezone(timezone.utc).isoformat()
