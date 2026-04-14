from __future__ import annotations

from psycopg_pool import AsyncConnectionPool

from app.schemas import (
    DashboardCategoryCount,
    DashboardMeetingMetrics,
    DashboardOpenTask,
    DashboardOverviewResponse,
    DashboardRecentDocument,
    LlmUsageSummary,
    MailCoverageResponse,
)


async def get_dashboard_overview(
    *,
    pool: AsyncConnectionPool,
    environment: str,
    mail_coverage: MailCoverageResponse,
    llm_usage: LlmUsageSummary,
) -> DashboardOverviewResponse:
    open_tasks = await load_open_tasks(pool)
    recent_documents = await load_recent_documents(pool)
    top_categories = await load_top_categories(pool)
    meeting_metrics = await load_meeting_metrics(pool)
    return DashboardOverviewResponse(
        environment=environment,
        mail_coverage=mail_coverage,
        llm_usage=llm_usage,
        open_tasks=open_tasks,
        recent_documents=recent_documents,
        top_categories=top_categories,
        meeting_metrics=meeting_metrics,
    )


async def load_open_tasks(pool: AsyncConnectionPool) -> list[DashboardOpenTask]:
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT title, due_at, priority, external_project_id AS project_id, status
                FROM tasks_mirror
                WHERE status = 'open'
                ORDER BY
                    CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,
                    due_at ASC,
                    priority ASC NULLS LAST
                LIMIT 50
                """
            )
            rows = await cur.fetchall()

    return [
        DashboardOpenTask(
            title=row["title"],
            due_at=row["due_at"],
            priority=row["priority"],
            project_id=row["project_id"],
            status=row["status"],
        )
        for row in rows
    ]


async def load_recent_documents(pool: AsyncConnectionPool) -> list[DashboardRecentDocument]:
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT
                    d.title,
                    d.created_at,
                    s.metadata->>'modified_label' AS source_modified_label,
                    COALESCE(d.metadata->>'message_date_day', r.metadata->>'message_date_day') AS message_day,
                    a.summary,
                    a.category,
                    a.priority
                FROM documents d
                JOIN sources s ON s.id = d.source_id
                LEFT JOIN document_revisions r ON r.id = d.current_revision_id
                LEFT JOIN LATERAL (
                    SELECT summary, category, priority
                    FROM document_analyses
                    WHERE revision_id = r.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) a ON true
                WHERE COALESCE(d.metadata->>'artifact_type', r.metadata->>'artifact_type') = 'email'
                ORDER BY d.created_at DESC
                LIMIT 25
                """
            )
            rows = await cur.fetchall()

    return [
        DashboardRecentDocument(
            title=row["title"],
            created_at=row["created_at"],
            message_day=row["message_day"],
            source_modified_label=row["source_modified_label"],
            summary=row["summary"],
            category=row["category"],
            priority=row["priority"],
        )
        for row in rows
    ]


async def load_top_categories(pool: AsyncConnectionPool) -> list[DashboardCategoryCount]:
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                WITH latest_analysis AS (
                    SELECT DISTINCT ON (revision_id)
                        revision_id,
                        COALESCE(NULLIF(category, ''), 'uncategorized') AS category
                    FROM document_analyses
                    ORDER BY revision_id, created_at DESC
                )
                SELECT
                    la.category,
                    COUNT(*)::int AS count
                FROM documents d
                JOIN document_revisions r ON r.id = d.current_revision_id
                JOIN latest_analysis la ON la.revision_id = r.id
                WHERE COALESCE(d.metadata->>'artifact_type', r.metadata->>'artifact_type') = 'email'
                GROUP BY la.category
                ORDER BY count DESC, la.category ASC
                LIMIT 8
                """
            )
            rows = await cur.fetchall()

    return [
        DashboardCategoryCount(category=row["category"], count=row["count"])
        for row in rows
    ]


async def load_meeting_metrics(pool: AsyncConnectionPool) -> DashboardMeetingMetrics:
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                WITH latest_analysis AS (
                    SELECT DISTINCT ON (revision_id)
                        revision_id,
                        action_items
                    FROM document_analyses
                    ORDER BY revision_id, created_at DESC
                ),
                meeting_docs AS (
                    SELECT
                        d.id,
                        COALESCE(
                            d.metadata->>'meeting_date_day',
                            r.metadata->>'meeting_date_day'
                        ) AS meeting_day,
                        COALESCE(
                            jsonb_array_length(COALESCE(la.action_items, '[]'::jsonb)),
                            0
                        ) AS action_items_count
                    FROM documents d
                    JOIN document_revisions r ON r.id = d.current_revision_id
                    LEFT JOIN latest_analysis la ON la.revision_id = r.id
                    WHERE COALESCE(d.metadata->>'artifact_type', r.metadata->>'artifact_type') = 'meeting_analysis'
                ),
                task_rollup AS (
                    SELECT
                        tm.source_document_id,
                        COUNT(*)::int AS mirrored_tasks_count,
                        COUNT(*) FILTER (WHERE tm.status = 'open')::int AS open_tasks_count,
                        COUNT(*) FILTER (
                            WHERE LOWER(COALESCE(tm.metadata->>'vikunja_synced', 'false')) IN ('true', '1', 'yes')
                        )::int AS synced_tasks_count
                    FROM tasks_mirror tm
                    WHERE tm.source_document_id IS NOT NULL
                    GROUP BY tm.source_document_id
                )
                SELECT
                    COUNT(*)::int AS total_meeting_documents,
                    COUNT(*) FILTER (
                        WHERE
                            meeting_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                            AND meeting_day::date >= CURRENT_DATE - INTERVAL '30 day'
                    )::int AS meetings_last_30_days,
                    COALESCE(SUM(md.action_items_count), 0)::int AS action_items_total,
                    COALESCE(SUM(COALESCE(tr.mirrored_tasks_count, 0)), 0)::int AS mirrored_tasks_total,
                    COALESCE(SUM(COALESCE(tr.open_tasks_count, 0)), 0)::int AS open_tasks_total,
                    COALESCE(SUM(COALESCE(tr.synced_tasks_count, 0)), 0)::int AS vikunja_synced_tasks_total,
                    COUNT(*) FILTER (
                        WHERE md.action_items_count > 0
                        AND COALESCE(tr.synced_tasks_count, 0) < md.action_items_count
                    )::int AS pending_sync_meetings
                FROM meeting_docs md
                LEFT JOIN task_rollup tr ON tr.source_document_id = md.id
                """
            )
            row = await cur.fetchone()

    if not row:
        return DashboardMeetingMetrics()

    return DashboardMeetingMetrics(
        total_meeting_documents=int(row["total_meeting_documents"] or 0),
        meetings_last_30_days=int(row["meetings_last_30_days"] or 0),
        action_items_total=int(row["action_items_total"] or 0),
        mirrored_tasks_total=int(row["mirrored_tasks_total"] or 0),
        open_tasks_total=int(row["open_tasks_total"] or 0),
        vikunja_synced_tasks_total=int(row["vikunja_synced_tasks_total"] or 0),
        pending_sync_meetings=int(row["pending_sync_meetings"] or 0),
    )
