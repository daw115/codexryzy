from fastapi import APIRouter, Depends, HTTPException, Request, status
from psycopg_pool import AsyncConnectionPool

from app.database import get_db_pool
from app.schemas import AssistantQueryRequest, AssistantQueryResponse
from app.security import require_api_key
from app.services.assistant import answer_query

router = APIRouter(
    prefix="/v1/assistant",
    tags=["assistant"],
    dependencies=[Depends(require_api_key)],
)


@router.post("/query", response_model=AssistantQueryResponse)
async def assistant_query_endpoint(
    payload: AssistantQueryRequest,
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> AssistantQueryResponse:
    try:
        return await answer_query(
            pool=db_pool,
            payload=payload,
            embedding_client=request.app.state.embedding_client,
            chat_client=request.app.state.chat_client,
        )
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
