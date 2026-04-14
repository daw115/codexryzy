from __future__ import annotations

import re
from typing import Any

from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from app.schemas import WebEnrichmentJob, WebEnrichmentRequest, WebEnrichmentResponse


def _normalize_topic_name(value: str) -> str:
    lowered = value.strip().lower()
    lowered = re.sub(r"\s+", " ", lowered)
    return lowered


async def _fetch_one(cursor, query: str, params: tuple[Any, ...]):
    await cursor.execute(query, params)
    return await cursor.fetchone()


async def queue_web_enrichment(
    *,
    pool: AsyncConnectionPool,
    payload: WebEnrichmentRequest,
) -> WebEnrichmentResponse:
    queued_jobs: list[WebEnrichmentJob] = []

    async with pool.connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                topic_rows = []
                for topic in payload.topics:
                    normalized_name = _normalize_topic_name(topic.name)
                    row = await _fetch_one(
                        cursor,
                        """
                        INSERT INTO knowledge_topics (
                            name,
                            normalized_name,
                            source,
                            metadata,
                            created_at,
                            updated_at
                        )
                        VALUES (%s, %s, 'analysis', %s, NOW(), NOW())
                        ON CONFLICT (normalized_name, source)
                        DO UPDATE SET
                            name = EXCLUDED.name,
                            metadata = COALESCE(knowledge_topics.metadata, '{}'::jsonb) || EXCLUDED.metadata,
                            updated_at = NOW()
                        RETURNING id, name
                        """,
                        (
                            topic.name,
                            normalized_name,
                            Jsonb(
                                {
                                    "confidence": topic.confidence,
                                    "origin": topic.origin,
                                    **topic.metadata,
                                }
                            ),
                        ),
                    )
                    topic_rows.append(row)

                if not topic_rows and payload.queries:
                    topic_rows.append({"id": None, "name": None})

                for topic_row in topic_rows:
                    if topic_row["id"] and payload.source_document_ids:
                        for index, document_id in enumerate(payload.source_document_ids):
                            revision_id = None
                            if index < len(payload.source_revision_ids):
                                revision_id = payload.source_revision_ids[index]
                            await cursor.execute(
                                """
                                INSERT INTO document_topics (
                                    document_id,
                                    revision_id,
                                    topic_id,
                                    confidence,
                                    origin,
                                    metadata,
                                    created_at
                                )
                                VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, NOW())
                                """,
                                (
                                    document_id,
                                    revision_id,
                                    topic_row["id"],
                                    None,
                                    "api_enrichment_request",
                                    Jsonb({}),
                                ),
                            )

                    query_text = payload.queries[0] if payload.queries else (topic_row["name"] if topic_row["name"] else None)
                    job = await _fetch_one(
                        cursor,
                        """
                        INSERT INTO enrichment_jobs (
                            job_type,
                            status,
                            topic_id,
                            source_document_id,
                            source_revision_id,
                            query_text,
                            search_queries,
                            allow_domains,
                            freshness_days,
                            max_results,
                            notes,
                            metadata,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            'web_research',
                            'pending',
                            %s,
                            %s::uuid,
                            %s::uuid,
                            %s,
                            %s,
                            %s,
                            %s,
                            %s,
                            %s,
                            %s,
                            NOW(),
                            NOW()
                        )
                        RETURNING id, status
                        """,
                        (
                            topic_row["id"],
                            payload.source_document_ids[0] if payload.source_document_ids else None,
                            payload.source_revision_ids[0] if payload.source_revision_ids else None,
                            query_text,
                            Jsonb(payload.queries),
                            Jsonb(payload.allow_domains),
                            payload.freshness_days,
                            payload.max_results,
                            payload.notes,
                            Jsonb({"trigger": "api"}),
                        ),
                    )
                    queued_jobs.append(
                        WebEnrichmentJob(
                            job_id=str(job["id"]),
                            topic_id=str(topic_row["id"]) if topic_row["id"] else None,
                            topic_name=topic_row["name"],
                            status=job["status"],
                        )
                    )

    return WebEnrichmentResponse(queued_jobs=queued_jobs)
