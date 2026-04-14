from fastapi import APIRouter, Depends, Request
from psycopg_pool import AsyncConnectionPool

from app.database import get_db_pool
from app.schemas import SearchRequest, SearchResponse
from app.security import require_api_key
from app.services.search import search_knowledge_base

router = APIRouter(
    prefix="/v1/search",
    tags=["search"],
    dependencies=[Depends(require_api_key)],
)


@router.post("", response_model=SearchResponse)
async def search_endpoint(
    payload: SearchRequest,
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> SearchResponse:
    query_embedding = await request.app.state.embedding_client.embed_text(payload.query)
    return await search_knowledge_base(
        pool=db_pool,
        payload=payload,
        query_embedding=query_embedding,
    )
