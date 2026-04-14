from fastapi import APIRouter, Depends, Query, Request
from psycopg_pool import AsyncConnectionPool

from app.database import get_db_pool
from app.schemas import MailCoverageResponse, StatusResponse
from app.security import require_api_key
from app.services.coverage import get_llm_usage_summary, get_mail_coverage, get_mail_coverage_summary

router = APIRouter(
    prefix="/v1/coverage",
    tags=["coverage"],
    dependencies=[Depends(require_api_key)],
)


@router.get("/mail-days", response_model=MailCoverageResponse)
async def mail_days_coverage_endpoint(
    day_limit: int = Query(60, ge=1, le=3650),
    document_limit: int = Query(30, ge=1, le=200),
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> MailCoverageResponse:
    return await get_mail_coverage(
        pool=db_pool,
        day_limit=day_limit,
        document_limit=document_limit,
    )


@router.get("/status", response_model=StatusResponse)
async def status_endpoint(
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> StatusResponse:
    settings = request.app.state.settings
    quota = getattr(settings, "llm_monthly_token_quota", None)

    mail_coverage, llm_usage = await _gather_status(pool=db_pool, quota=quota)

    # quick db check
    try:
        async with db_pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
        db_status = "ok"
    except Exception:
        db_status = "error"

    return StatusResponse(
        status="ok",
        database=db_status,
        environment=settings.app_env,
        mail_coverage=mail_coverage,
        llm_usage=llm_usage,
    )


async def _gather_status(pool, quota):
    import asyncio
    mail_coverage, llm_usage = await asyncio.gather(
        get_mail_coverage_summary(pool),
        get_llm_usage_summary(pool, quota_monthly_tokens=quota),
    )
    return mail_coverage, llm_usage
