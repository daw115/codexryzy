from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel

from app.database import get_db_pool
from app.schemas import IngestDocumentRequest, IngestDocumentResponse, SourceType
from app.security import require_api_key
from app.services.ingest import ingest_document

router = APIRouter(
    prefix="/v1/documents",
    tags=["documents"],
    dependencies=[Depends(require_api_key)],
)


class DocumentExistsResponse(BaseModel):
    exists: bool
    source_type: str
    external_id: str
    document_id: str | None = None


@router.get("/exists", response_model=DocumentExistsResponse)
async def document_exists_endpoint(
    source_type: SourceType = Query(...),
    external_id: str = Query(..., min_length=1),
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> DocumentExistsResponse:
    async with db_pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT d.id::text AS document_id
                FROM sources s
                JOIN documents d ON d.source_id = s.id
                WHERE s.source_type = %s AND s.external_id = %s
                LIMIT 1
                """,
                (source_type, external_id),
            )
            row = await cur.fetchone()
    return DocumentExistsResponse(
        exists=row is not None,
        source_type=source_type,
        external_id=external_id,
        document_id=row["document_id"] if row else None,
    )


@router.post(
    "/ingest",
    response_model=IngestDocumentResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_document_endpoint(
    payload: IngestDocumentRequest,
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> IngestDocumentResponse:
    try:
        return await ingest_document(
            pool=db_pool,
            payload=payload,
            vector_dimensions=request.app.state.settings.vector_dimensions,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error
