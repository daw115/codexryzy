from fastapi import APIRouter, Depends
from psycopg_pool import AsyncConnectionPool

from app.database import get_db_pool
from app.schemas import WebEnrichmentRequest, WebEnrichmentResponse
from app.security import require_api_key
from app.services.enrichment import queue_web_enrichment

router = APIRouter(
    prefix="/v1/enrichment",
    tags=["enrichment"],
    dependencies=[Depends(require_api_key)],
)


@router.post("/web", response_model=WebEnrichmentResponse)
async def queue_web_enrichment_endpoint(
    payload: WebEnrichmentRequest,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> WebEnrichmentResponse:
    return await queue_web_enrichment(pool=db_pool, payload=payload)
