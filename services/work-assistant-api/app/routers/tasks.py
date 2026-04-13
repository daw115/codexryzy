from fastapi import APIRouter, Depends, HTTPException, Request, status
from psycopg_pool import AsyncConnectionPool

from app.database import get_db_pool
from app.schemas import (
    TaskActionResponse,
    TaskListRequest,
    TaskListResponse,
    TaskScheduleResponse,
    TaskSyncRequest,
    TaskSyncResponse,
)
from app.security import require_api_key
from app.services.tasks import build_schedule_feed, complete_task, query_tasks, sync_tasks_from_vikunja

router = APIRouter(
    prefix="/v1/tasks",
    tags=["tasks"],
    dependencies=[Depends(require_api_key)],
)


@router.post("/sync", response_model=TaskSyncResponse)
async def sync_tasks_endpoint(
    payload: TaskSyncRequest,
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> TaskSyncResponse:
    try:
        return await sync_tasks_from_vikunja(
            pool=db_pool,
            vikunja_client=request.app.state.vikunja_client,
            payload=payload,
        )
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error


@router.post("/query", response_model=TaskListResponse)
async def query_tasks_endpoint(
    payload: TaskListRequest,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> TaskListResponse:
    return await query_tasks(pool=db_pool, payload=payload)


@router.get("/schedule", response_model=TaskScheduleResponse)
async def task_schedule_endpoint(
    horizon_days: int = 7,
    limit: int = 200,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> TaskScheduleResponse:
    return await build_schedule_feed(
        pool=db_pool,
        horizon_days=max(1, min(30, horizon_days)),
        limit=max(1, min(500, limit)),
    )


@router.post("/{task_id}/complete", response_model=TaskActionResponse)
async def complete_task_endpoint(
    task_id: int,
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> TaskActionResponse:
    try:
        return await complete_task(
            pool=db_pool,
            vikunja_client=request.app.state.vikunja_client,
            task_id=task_id,
        )
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
