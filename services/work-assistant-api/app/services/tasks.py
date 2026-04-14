from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from app.clients.vikunja import VikunjaClient
from app.schemas import (
    TaskActionResponse,
    TaskListItem,
    TaskListRequest,
    TaskListResponse,
    TaskScheduleResponse,
    TaskSyncRequest,
    TaskSyncResponse,
)


async def sync_tasks_from_vikunja(
    *,
    pool: AsyncConnectionPool,
    vikunja_client: VikunjaClient,
    payload: TaskSyncRequest,
) -> TaskSyncResponse:
    if not vikunja_client.enabled:
        raise RuntimeError("VIKUNJA_URL and VIKUNJA_API_TOKEN must be configured")

    projects = await vikunja_client.list_projects()
    if payload.project_ids:
        allowed_ids = {project_id for project_id in payload.project_ids}
        projects = [project for project in projects if int(project.get("id", 0)) in allowed_ids]
    elif not payload.include_archived:
        projects = [project for project in projects if not project.get("is_archived")]

    synced_tasks = 0
    async with pool.connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                for project in projects:
                    project_id = int(project["id"])
                    tasks = await vikunja_client.list_project_tasks(project_id)
                    for task in tasks:
                        await _upsert_vikunja_task(cursor, task)
                        synced_tasks += 1

    return TaskSyncResponse(synced_projects=len(projects), synced_tasks=synced_tasks)


async def complete_task(
    *,
    pool: AsyncConnectionPool,
    vikunja_client: VikunjaClient,
    task_id: int,
) -> TaskActionResponse:
    if not vikunja_client.enabled:
        raise RuntimeError("VIKUNJA_URL and VIKUNJA_API_TOKEN must be configured")

    current = await vikunja_client.get_task(task_id)
    updated = await vikunja_client.update_task(
        task_id,
        body=_build_task_update_payload(current, done=True),
    )

    async with pool.connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await _upsert_vikunja_task(cursor, updated)

    return TaskActionResponse(
        external_task_id=str(updated["id"]),
        title=updated.get("title") or "",
        status=_vikunja_status(updated),
        due_at=_parse_timestamp(updated.get("due_date")),
        priority=updated.get("priority"),
        project_id=str(updated.get("project_id")) if updated.get("project_id") is not None else None,
    )


async def query_tasks(
    *,
    pool: AsyncConnectionPool,
    payload: TaskListRequest,
) -> TaskListResponse:
    conditions = []
    params: list[Any] = []

    if payload.statuses:
        conditions.append("status = ANY(%s)")
        params.append(payload.statuses)
    if payload.due_before is not None:
        conditions.append("due_at <= %s")
        params.append(payload.due_before)
    if payload.due_after is not None:
        conditions.append("due_at >= %s")
        params.append(payload.due_after)
    if payload.project_ids:
        conditions.append("external_project_id = ANY(%s)")
        params.append(payload.project_ids)

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                f"""
                SELECT
                    external_task_id,
                    external_project_id,
                    title,
                    description,
                    status,
                    due_at,
                    priority,
                    updated_at
                FROM tasks_mirror
                {where_clause}
                ORDER BY
                    CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,
                    due_at ASC NULLS LAST,
                    priority DESC NULLS LAST,
                    updated_at DESC
                LIMIT %s
                """,
                (*params, payload.limit),
            )
            rows = await cursor.fetchall()

    return TaskListResponse(
        tasks=[
            TaskListItem(
                external_task_id=row["external_task_id"],
                project_id=row["external_project_id"],
                title=row["title"],
                description=row["description"],
                status=row["status"],
                due_at=row["due_at"],
                priority=row["priority"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]
    )


async def build_schedule_feed(
    *,
    pool: AsyncConnectionPool,
    horizon_days: int = 7,
    limit: int = 200,
) -> TaskScheduleResponse:
    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                SELECT
                    external_task_id,
                    external_project_id,
                    title,
                    description,
                    status,
                    due_at,
                    priority,
                    updated_at
                FROM tasks_mirror
                WHERE status = 'open'
                ORDER BY
                    CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,
                    due_at ASC NULLS LAST,
                    priority DESC NULLS LAST,
                    updated_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = await cursor.fetchall()

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)
    horizon_end = today_start + timedelta(days=max(1, horizon_days) + 1)

    overdue: list[TaskListItem] = []
    today: list[TaskListItem] = []
    next_days: list[TaskListItem] = []
    later: list[TaskListItem] = []
    unscheduled: list[TaskListItem] = []

    for row in rows:
        task = TaskListItem(
            external_task_id=row["external_task_id"],
            project_id=row["external_project_id"],
            title=row["title"],
            description=row["description"],
            status=row["status"],
            due_at=row["due_at"],
            priority=row["priority"],
            updated_at=row["updated_at"],
        )
        if task.due_at is None:
            unscheduled.append(task)
            continue

        due_at = task.due_at
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)

        if due_at < today_start:
            overdue.append(task)
        elif due_at < tomorrow_start:
            today.append(task)
        elif due_at < horizon_end:
            next_days.append(task)
        else:
            later.append(task)

    return TaskScheduleResponse(
        generated_at=now,
        overdue=overdue,
        today=today,
        next_7_days=next_days,
        later=later,
        unscheduled=unscheduled,
    )


def _build_task_update_payload(task: dict[str, Any], *, done: bool) -> dict[str, Any]:
    return {
        "title": task.get("title") or "",
        "description": task.get("description") or "",
        "done": done,
        "project_id": task.get("project_id"),
        "due_date": task.get("due_date"),
        "priority": task.get("priority"),
        "start_date": task.get("start_date"),
        "end_date": task.get("end_date"),
        "repeat_after": task.get("repeat_after"),
        "repeat_mode": task.get("repeat_mode"),
        "hex_color": task.get("hex_color") or "",
    }


def _vikunja_status(task: dict[str, Any]) -> str:
    return "done" if task.get("done") else "open"


def _parse_timestamp(value: Any):
    if not value:
        return None
    from datetime import datetime

    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None
    return None


async def _upsert_vikunja_task(cursor, task: dict[str, Any]) -> None:
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
        VALUES (%s, %s, NULL, NULL, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())
        ON CONFLICT (external_task_id)
        DO UPDATE SET
            external_project_id = EXCLUDED.external_project_id,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            due_at = EXCLUDED.due_at,
            priority = EXCLUDED.priority,
            status = EXCLUDED.status,
            metadata = EXCLUDED.metadata,
            synced_at = NOW(),
            updated_at = NOW()
        """,
        (
            str(task["id"]),
            str(task.get("project_id")) if task.get("project_id") is not None else None,
            task.get("title") or "",
            task.get("description") or "",
            _parse_timestamp(task.get("due_date")),
            task.get("priority"),
            _vikunja_status(task),
            Jsonb(
                {
                    "identifier": task.get("identifier"),
                    "done": task.get("done"),
                    "done_at": task.get("done_at"),
                    "created": task.get("created"),
                    "updated": task.get("updated"),
                    "project_id": task.get("project_id"),
                }
            ),
        ),
    )
