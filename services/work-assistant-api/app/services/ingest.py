from typing import Any

from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from app.schemas import (
    DocumentMetadataRefreshRequest,
    DocumentMetadataRefreshResponse,
    IngestDocumentRequest,
    IngestDocumentResponse,
)


async def _fetch_one(cursor, query: str, params: tuple[Any, ...]):
    await cursor.execute(query, params)
    return await cursor.fetchone()


async def ingest_document(
    pool: AsyncConnectionPool,
    payload: IngestDocumentRequest,
    vector_dimensions: int,
) -> IngestDocumentResponse:
    async with pool.connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                source = await _fetch_one(
                    cursor,
                    """
                    INSERT INTO sources (
                        source_type,
                        external_id,
                        checksum,
                        metadata,
                        first_seen_at,
                        last_seen_at
                    )
                    VALUES (%s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (source_type, external_id)
                    DO UPDATE SET
                        checksum = EXCLUDED.checksum,
                        metadata = COALESCE(sources.metadata, '{}'::jsonb) || EXCLUDED.metadata,
                        last_seen_at = NOW()
                    RETURNING id
                    """,
                    (
                        payload.source_type,
                        payload.external_id,
                        payload.checksum,
                        Jsonb(payload.source_metadata),
                    ),
                )

                document = await _fetch_one(
                    cursor,
                    """
                    INSERT INTO documents (
                        source_id,
                        title,
                        mime_type,
                        raw_storage_url,
                        metadata,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (source_id)
                    DO UPDATE SET
                        title = EXCLUDED.title,
                        mime_type = EXCLUDED.mime_type,
                        raw_storage_url = EXCLUDED.raw_storage_url,
                        metadata = COALESCE(documents.metadata, '{}'::jsonb) || EXCLUDED.metadata,
                        updated_at = NOW()
                    RETURNING id, current_revision_id
                    """,
                    (
                        source["id"],
                        payload.title,
                        payload.mime_type,
                        payload.raw_storage_url,
                        Jsonb(payload.document_metadata),
                    ),
                )

                existing_revision = None
                if payload.checksum:
                    existing_revision = await _fetch_one(
                        cursor,
                        """
                        SELECT id, processing_version
                        FROM document_revisions
                        WHERE document_id = %s AND checksum = %s
                        ORDER BY processing_version DESC
                        LIMIT 1
                        """,
                        (document["id"], payload.checksum),
                    )

                if existing_revision and payload.skip_if_checksum_matches:
                    await cursor.execute(
                        """
                        UPDATE documents
                        SET current_revision_id = %s, updated_at = NOW()
                        WHERE id = %s
                        """,
                        (existing_revision["id"], document["id"]),
                    )
                    mirrored_tasks = await _upsert_tasks(
                        cursor=cursor,
                        tasks=payload.tasks,
                        document_id=document["id"],
                        revision_id=existing_revision["id"],
                    )
                    return IngestDocumentResponse(
                        status="deduplicated",
                        source_id=str(source["id"]),
                        document_id=str(document["id"]),
                        revision_id=str(existing_revision["id"]),
                        processing_version=existing_revision["processing_version"],
                        stored_chunks=0,
                        mirrored_tasks=mirrored_tasks,
                    )

                next_version_row = await _fetch_one(
                    cursor,
                    """
                    SELECT COALESCE(MAX(processing_version), 0) + 1 AS next_version
                    FROM document_revisions
                    WHERE document_id = %s
                    """,
                    (document["id"],),
                )
                next_version = int(next_version_row["next_version"])

                revision = await _fetch_one(
                    cursor,
                    """
                    INSERT INTO document_revisions (
                        document_id,
                        checksum,
                        extracted_text,
                        normalized_text,
                        language,
                        metadata,
                        processing_version,
                        processed_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id
                    """,
                    (
                        document["id"],
                        payload.checksum,
                        payload.extracted_text,
                        payload.normalized_text or payload.extracted_text,
                        payload.language,
                        Jsonb(payload.document_metadata),
                        next_version,
                    ),
                )

                await cursor.execute(
                    """
                    UPDATE documents
                    SET current_revision_id = %s, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (revision["id"], document["id"]),
                )

                if payload.analysis:
                    await cursor.execute(
                        """
                        INSERT INTO document_analyses (
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
                            metadata,
                            created_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        """,
                        (
                            revision["id"],
                            payload.analysis.model,
                            payload.analysis.prompt_version,
                            payload.analysis.summary,
                            payload.analysis.category,
                            payload.analysis.priority,
                            payload.analysis.confidence,
                            Jsonb(payload.analysis.action_items),
                            Jsonb(payload.analysis.entities),
                            Jsonb(payload.analysis.deadlines),
                            Jsonb(payload.analysis.open_questions),
                            Jsonb(payload.analysis.metadata),
                        ),
                    )

                stored_chunks = 0
                for chunk in payload.chunks:
                    if chunk.embedding is not None and len(chunk.embedding) != vector_dimensions:
                        raise ValueError(
                            f"Chunk {chunk.chunk_index} embedding has dimension "
                            f"{len(chunk.embedding)}, expected {vector_dimensions}"
                        )
                    vector_literal = None
                    if chunk.embedding is not None:
                        vector_literal = "[" + ",".join(f"{value:.12g}" for value in chunk.embedding) + "]"

                    await cursor.execute(
                        """
                        INSERT INTO document_chunks (
                            revision_id,
                            chunk_index,
                            content,
                            token_count,
                            embedding,
                            metadata,
                            created_at
                        )
                        VALUES (%s, %s, %s, %s, %s::vector, %s, NOW())
                        """,
                        (
                            revision["id"],
                            chunk.chunk_index,
                            chunk.content,
                            chunk.token_count,
                            vector_literal,
                            Jsonb(chunk.metadata),
                        ),
                    )
                    stored_chunks += 1

                mirrored_tasks = await _upsert_tasks(
                    cursor=cursor,
                    tasks=payload.tasks,
                    document_id=document["id"],
                    revision_id=revision["id"],
                )

    return IngestDocumentResponse(
        status="ingested",
        source_id=str(source["id"]),
        document_id=str(document["id"]),
        revision_id=str(revision["id"]),
        processing_version=next_version,
        stored_chunks=stored_chunks,
        mirrored_tasks=mirrored_tasks,
    )


async def _upsert_tasks(cursor, tasks, document_id, revision_id) -> int:
    mirrored = 0
    for task in tasks:
        if not task.external_task_id:
            continue
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
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())
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


async def refresh_document_metadata(
    pool: AsyncConnectionPool,
    payload: DocumentMetadataRefreshRequest,
) -> DocumentMetadataRefreshResponse | None:
    async with pool.connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                source = await _fetch_one(
                    cursor,
                    """
                    SELECT
                        s.id,
                        d.id AS document_id,
                        d.current_revision_id
                    FROM sources s
                    JOIN documents d ON d.source_id = s.id
                    WHERE s.source_type = %s AND s.external_id = %s
                    LIMIT 1
                    """,
                    (payload.source_type, payload.external_id),
                )
                if not source:
                    return None

                updated_source_metadata = bool(payload.source_metadata)
                updated_document_metadata = bool(payload.document_metadata)
                updated_revision_metadata = bool(payload.document_metadata and source["current_revision_id"])

                if updated_source_metadata:
                    await cursor.execute(
                        """
                        UPDATE sources
                        SET metadata = COALESCE(metadata, '{}'::jsonb) || %s,
                            last_seen_at = NOW()
                        WHERE id = %s
                        """,
                        (Jsonb(payload.source_metadata), source["id"]),
                    )

                if updated_document_metadata:
                    await cursor.execute(
                        """
                        UPDATE documents
                        SET metadata = COALESCE(metadata, '{}'::jsonb) || %s,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (Jsonb(payload.document_metadata), source["document_id"]),
                    )

                if updated_revision_metadata:
                    await cursor.execute(
                        """
                        UPDATE document_revisions
                        SET metadata = COALESCE(metadata, '{}'::jsonb) || %s,
                            processed_at = NOW()
                        WHERE id = %s
                        """,
                        (Jsonb(payload.document_metadata), source["current_revision_id"]),
                    )

    return DocumentMetadataRefreshResponse(
        source_id=str(source["id"]),
        document_id=str(source["document_id"]),
        revision_id=str(source["current_revision_id"]) if source["current_revision_id"] else None,
        updated_source_metadata=updated_source_metadata,
        updated_document_metadata=updated_document_metadata,
        updated_revision_metadata=updated_revision_metadata,
    )
