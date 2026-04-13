from fastapi import APIRouter, Depends, Response, status
from psycopg_pool import AsyncConnectionPool

from app.database import get_db_pool
from app.schemas import LlmUsageLogRequest
from app.security import require_api_key
from app.services.usage import record_llm_usage

router = APIRouter(
    prefix="/v1/usage",
    tags=["usage"],
    dependencies=[Depends(require_api_key)],
)


@router.post("/llm", status_code=status.HTTP_202_ACCEPTED)
async def log_llm_usage(
    payload: LlmUsageLogRequest,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> Response:
    await record_llm_usage(pool=db_pool, payload=payload)
    return Response(status_code=status.HTTP_202_ACCEPTED)
