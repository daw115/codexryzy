from psycopg_pool import AsyncConnectionPool

from app.schemas import SearchDocumentHit, SearchRequest, SearchResponse, SearchTaskHit


async def search_knowledge_base(
    pool: AsyncConnectionPool,
    payload: SearchRequest,
    query_embedding: list[float] | None = None,
) -> SearchResponse:
    documents_by_id: dict[str, SearchDocumentHit] = {}
    tasks: list[SearchTaskHit] = []

    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
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
                    d.title,
                    a.summary,
                    a.category,
                    a.priority,
                    ts_headline(
                        'simple',
                        COALESCE(r.extracted_text, ''),
                        websearch_to_tsquery('simple', %s),
                        'MaxFragments=2, MaxWords=20, MinWords=8'
                    ) AS excerpt,
                    ts_rank_cd(
                        setweight(to_tsvector('simple', COALESCE(d.title, '')), 'A') ||
                        setweight(to_tsvector('simple', COALESCE(r.extracted_text, '')), 'B'),
                        websearch_to_tsquery('simple', %s)
                    ) AS score
                FROM documents d
                JOIN document_revisions r ON r.id = d.current_revision_id
                LEFT JOIN latest_analysis a ON a.revision_id = r.id
                WHERE (
                    setweight(to_tsvector('simple', COALESCE(d.title, '')), 'A') ||
                    setweight(to_tsvector('simple', COALESCE(r.extracted_text, '')), 'B')
                ) @@ websearch_to_tsquery('simple', %s)
                ORDER BY score DESC, d.updated_at DESC
                LIMIT %s
                """,
                (
                    payload.query,
                    payload.query,
                    payload.query,
                    payload.limit,
                ),
            )
            document_rows = await cursor.fetchall()

            for row in document_rows:
                documents_by_id[row["document_id"]] = SearchDocumentHit(
                    document_id=row["document_id"],
                    revision_id=row["revision_id"],
                    title=row["title"],
                    summary=row["summary"],
                    category=row["category"],
                    priority=row["priority"],
                    excerpt=row["excerpt"],
                    score=float(row["score"]),
                )

            if query_embedding:
                vector_literal = "[" + ",".join(f"{value:.12g}" for value in query_embedding) + "]"
                await cursor.execute(
                    """
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
                        d.title,
                        a.summary,
                        a.category,
                        a.priority,
                        LEFT(dc.content, 800) AS excerpt,
                        GREATEST(0, 1 - (dc.embedding <=> %s::vector)) AS score
                    FROM document_chunks dc
                    JOIN document_revisions r ON r.id = dc.revision_id
                    JOIN documents d ON d.current_revision_id = r.id
                    LEFT JOIN latest_analysis a ON a.revision_id = r.id
                    WHERE dc.embedding IS NOT NULL
                    ORDER BY dc.embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (vector_literal, vector_literal, payload.limit),
                )
                semantic_rows = await cursor.fetchall()

                for row in semantic_rows:
                    semantic_score = float(row["score"])
                    existing = documents_by_id.get(row["document_id"])
                    if existing is None:
                        documents_by_id[row["document_id"]] = SearchDocumentHit(
                            document_id=row["document_id"],
                            revision_id=row["revision_id"],
                            title=row["title"],
                            summary=row["summary"],
                            category=row["category"],
                            priority=row["priority"],
                            excerpt=row["excerpt"],
                            score=semantic_score,
                        )
                        continue

                    existing.score = max(existing.score, semantic_score) + min(existing.score, semantic_score) * 0.25
                    if not existing.excerpt and row["excerpt"]:
                        existing.excerpt = row["excerpt"]
                    if not existing.summary and row["summary"]:
                        existing.summary = row["summary"]
                    if not existing.category and row["category"]:
                        existing.category = row["category"]
                    if not existing.priority and row["priority"]:
                        existing.priority = row["priority"]

            if payload.include_tasks:
                await cursor.execute(
                    """
                    SELECT
                        external_task_id,
                        title,
                        status,
                        due_at,
                        priority,
                        ts_rank_cd(
                            setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
                            setweight(to_tsvector('simple', COALESCE(description, '')), 'B'),
                            websearch_to_tsquery('simple', %s)
                        ) AS score
                    FROM tasks_mirror
                    WHERE (
                        setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
                        setweight(to_tsvector('simple', COALESCE(description, '')), 'B')
                    ) @@ websearch_to_tsquery('simple', %s)
                    ORDER BY score DESC, updated_at DESC
                    LIMIT %s
                    """,
                    (payload.query, payload.query, payload.limit),
                )
                task_rows = await cursor.fetchall()
                for row in task_rows:
                    tasks.append(
                        SearchTaskHit(
                            external_task_id=row["external_task_id"],
                            title=row["title"],
                            status=row["status"],
                            due_at=row["due_at"],
                            priority=row["priority"],
                            score=float(row["score"]),
                        )
                    )

    documents = sorted(documents_by_id.values(), key=lambda item: item.score, reverse=True)[: payload.limit]
    return SearchResponse(query=payload.query, documents=documents, tasks=tasks)
