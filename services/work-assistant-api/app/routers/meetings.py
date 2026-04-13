from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from psycopg_pool import AsyncConnectionPool

from app.database import get_db_pool
from app.schemas import (
    MeetingBulkSyncRequest,
    MeetingBulkSyncResponse,
    MeetingIntakeRequest,
    MeetingIntakeResponse,
    MeetingQueryRequest,
    MeetingQueryResponse,
    MeetingTaskRebuildRequest,
    MeetingTaskRebuildResponse,
    TaskActionResponse,
)
from app.security import require_api_key
from app.services.meetings import (
    bulk_sync_pending_meetings,
    complete_meeting_task,
    intake_meeting,
    query_meetings,
    rebuild_meeting_tasks,
)

router = APIRouter(
    prefix="/v1/meetings",
    tags=["meetings"],
    dependencies=[Depends(require_api_key)],
)


@router.post(
    "/intake",
    response_model=MeetingIntakeResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def intake_meeting_endpoint(
    payload: MeetingIntakeRequest,
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> MeetingIntakeResponse:
    try:
        return await intake_meeting(
            pool=db_pool,
            payload=payload,
            vector_dimensions=request.app.state.settings.vector_dimensions,
            embedding_client=request.app.state.embedding_client,
            chat_client=request.app.state.chat_client,
            vikunja_client=request.app.state.vikunja_client,
            default_project_id=request.app.state.settings.vikunja_default_project_id,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error


@router.get("/query", response_model=MeetingQueryResponse)
async def query_meetings_endpoint(
    limit: int = Query(25, ge=1, le=100),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    category: str | None = Query(None),
    project: str | None = Query(None),
    sync_status: str | None = Query(None),
    search_text: str | None = Query(None),
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> MeetingQueryResponse:
    try:
        payload = MeetingQueryRequest(
            limit=limit,
            date_from=date_from,
            date_to=date_to,
            category=category,
            project=project,
            sync_status=sync_status,  # type: ignore[arg-type]
            search_text=search_text,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error
    return await query_meetings(pool=db_pool, payload=payload)


@router.post(
    "/{document_id}/rebuild-tasks",
    response_model=MeetingTaskRebuildResponse,
)
async def rebuild_meeting_tasks_endpoint(
    document_id: str,
    payload: MeetingTaskRebuildRequest,
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> MeetingTaskRebuildResponse:
    result = await rebuild_meeting_tasks(
        pool=db_pool,
        payload=payload,
        document_id=document_id,
        vikunja_client=request.app.state.vikunja_client,
        default_project_id=request.app.state.settings.vikunja_default_project_id,
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return result


@router.post("/sync-pending", response_model=MeetingBulkSyncResponse)
async def bulk_sync_pending_meetings_endpoint(
    payload: MeetingBulkSyncRequest,
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> MeetingBulkSyncResponse:
    return await bulk_sync_pending_meetings(
        pool=db_pool,
        payload=payload,
        vikunja_client=request.app.state.vikunja_client,
        default_project_id=request.app.state.settings.vikunja_default_project_id,
    )


@router.post("/tasks/{external_task_id}/complete", response_model=TaskActionResponse)
async def complete_meeting_task_endpoint(
    external_task_id: str,
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> TaskActionResponse:
    try:
        return await complete_meeting_task(
            pool=db_pool,
            external_task_id=external_task_id,
            vikunja_client=request.app.state.vikunja_client,
        )
    except ValueError as error:
        if "not found" in str(error).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
