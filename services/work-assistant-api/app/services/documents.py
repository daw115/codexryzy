from psycopg_pool import AsyncConnectionPool

from app.schemas import (
    DocumentAnalysisRead,
    DocumentDetailResponse,
    DocumentDetailTask,
    DocumentListItem,
    DocumentQueryRequest,
    DocumentQueryResponse,
)


async def query_documents(
    pool: AsyncConnectionPool,
    payload: DocumentQueryRequest,
) -> DocumentQueryResponse:
    filters: list[str] = []
    params: list[object] = []

    if payload.source_type:
        filters.append("s.source_type = %s")
        params.append(payload.source_type)

    if payload.artifact_type:
        filters.append("d.metadata ->> 'artifact_type' = %s")
        params.append(payload.artifact_type)

    if payload.category:
        filters.append("a.category = %s")
        params.append(payload.category)

    if payload.search_text:
        filters.append(
            """
            (
                setweight(to_tsvector('simple', COALESCE(d.title, '')), 'A') ||
                setweight(to_tsvector('simple', COALESCE(r.extracted_text, '')), 'B')
            ) @@ websearch_to_tsquery('simple', %s)
            """
        )
        params.append(payload.search_text)

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                f"""
                WITH latest_analysis AS (
                    SELECT DISTINCT ON (revision_id)
                        revision_id,
                        summary,
                        category,
                        priority
                    FROM document_analyses
                    ORDER BY revision_id, created_at DESC
                )
                SELECT
                    d.id::text AS document_id,
                    r.id::text AS revision_id,
                    s.source_type,
                    s.external_id,
                    d.title,
                    d.mime_type,
                    d.raw_storage_url,
                    d.metadata ->> 'artifact_type' AS artifact_type,
                    a.summary,
                    a.category,
                    a.priority,
                    COALESCE(
                        d.metadata ->> 'message_date_day',
                        d.metadata ->> 'meeting_date_day'
                    ) AS message_day,
                    d.created_at,
                    d.updated_at
                FROM documents d
                JOIN sources s ON s.id = d.source_id
                JOIN document_revisions r ON r.id = d.current_revision_id
                LEFT JOIN latest_analysis a ON a.revision_id = r.id
                {where_clause}
                ORDER BY
                    COALESCE(
                        d.metadata ->> 'message_date_day',
                        d.metadata ->> 'meeting_date_day'
                    ) DESC NULLS LAST,
                    d.updated_at DESC
                LIMIT %s
                """,
                (*params, payload.limit),
            )
            rows = await cursor.fetchall()

    return DocumentQueryResponse(
        documents=[
            DocumentListItem(
                document_id=row["document_id"],
                revision_id=row["revision_id"],
                source_type=row["source_type"],
                external_id=row["external_id"],
                title=row["title"],
                mime_type=row["mime_type"],
                raw_storage_url=row["raw_storage_url"],
                artifact_type=row["artifact_type"],
                summary=row["summary"],
                category=row["category"],
                priority=row["priority"],
                message_day=row["message_day"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]
    )


async def get_document_detail(
    pool: AsyncConnectionPool,
    document_id: str,
) -> DocumentDetailResponse | None:
    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                WITH latest_analysis AS (
                    SELECT DISTINCT ON (revision_id)
                        revision_id,
                        model,
                        prompt_version,
                        summary,
                        category,
                        priority,
                        confidence,
                        action_items,
                        entities,
                        deadlines,
                        open_questions,
                        metadata
                    FROM document_analyses
                    ORDER BY revision_id, created_at DESC
                )
                SELECT
                    d.id::text AS document_id,
                    r.id::text AS revision_id,
                    s.source_type,
                    s.external_id,
                    d.title,
                    d.mime_type,
                    d.raw_storage_url,
                    d.created_at,
                    d.updated_at,
                    s.metadata AS source_metadata,
                    d.metadata AS document_metadata,
                    r.extracted_text,
                    r.normalized_text,
                    r.language,
                    a.model,
                    a.prompt_version,
                    a.summary,
                    a.category,
                    a.priority,
                    a.confidence,
                    a.action_items,
                    a.entities,
                    a.deadlines,
                    a.open_questions,
                    a.metadata AS analysis_metadata
                FROM documents d
                JOIN sources s ON s.id = d.source_id
                JOIN document_revisions r ON r.id = d.current_revision_id
                LEFT JOIN latest_analysis a ON a.revision_id = r.id
                WHERE d.id = %s::uuid
                LIMIT 1
                """,
                (document_id,),
            )
            row = await cursor.fetchone()
            if not row:
                return None

            await cursor.execute(
                """
                SELECT
                    external_task_id,
                    external_project_id,
                    title,
                    description,
                    due_at,
                    priority,
                    status
                FROM tasks_mirror
                WHERE source_document_id = %s::uuid
                ORDER BY
                    CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,
                    due_at ASC,
                    updated_at DESC
                """,
                (document_id,),
            )
            task_rows = await cursor.fetchall()

    analysis = None
    if row["summary"] is not None:
        analysis = DocumentAnalysisRead(
            model=row["model"],
            prompt_version=row["prompt_version"],
            summary=row["summary"],
            category=row["category"],
            priority=row["priority"],
            confidence=row["confidence"],
            action_items=row["action_items"] or [],
            entities=row["entities"] or [],
            deadlines=row["deadlines"] or [],
            open_questions=row["open_questions"] or [],
            metadata=row["analysis_metadata"] or {},
        )

    return DocumentDetailResponse(
        document_id=row["document_id"],
        revision_id=row["revision_id"],
        source_type=row["source_type"],
        external_id=row["external_id"],
        title=row["title"],
        mime_type=row["mime_type"],
        raw_storage_url=row["raw_storage_url"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        source_metadata=row["source_metadata"] or {},
        document_metadata=row["document_metadata"] or {},
        extracted_text=row["extracted_text"],
        normalized_text=row["normalized_text"],
        language=row["language"],
        analysis=analysis,
        tasks=[
            DocumentDetailTask(
                external_task_id=task["external_task_id"],
                external_project_id=task["external_project_id"],
                title=task["title"],
                description=task["description"],
                due_at=task["due_at"],
                priority=task["priority"],
                status=task["status"],
            )
            for task in task_rows
        ],
    )
