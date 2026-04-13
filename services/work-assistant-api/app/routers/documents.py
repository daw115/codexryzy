from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel

from app.database import get_db_pool
from app.schemas import (
    DocumentDetailResponse,
    DocumentMetadataRefreshRequest,
    DocumentMetadataRefreshResponse,
    DocumentQueryRequest,
    DocumentQueryResponse,
    IngestDocumentRequest,
    IngestDocumentResponse,
    SourceType,
)
from app.security import require_api_key
from app.services.ingest import ingest_document, refresh_document_metadata
from app.services.meetings import sync_document_tasks_to_vikunja
from app.services.documents import get_document_detail, query_documents

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
        result = await ingest_document(
            pool=db_pool,
            payload=payload,
            vector_dimensions=request.app.state.settings.vector_dimensions,
        )
        if payload.auto_sync_tasks and payload.tasks:
            artifact_type = payload.document_metadata.get("artifact_type")
            if artifact_type == "meeting_analysis":
                synced, errors = await sync_document_tasks_to_vikunja(
                    pool=db_pool,
                    vikunja_client=request.app.state.vikunja_client,
                    document_id=result.document_id,
                    revision_id=result.revision_id,
                    default_project_id=request.app.state.settings.vikunja_default_project_id,
                )
                result = IngestDocumentResponse(
                    **result.model_dump(),
                    vikunja_synced=synced,
                    sync_errors=errors,
                )
        return result
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error


@router.post("/query", response_model=DocumentQueryResponse)
async def query_documents_endpoint(
    payload: DocumentQueryRequest,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> DocumentQueryResponse:
    return await query_documents(pool=db_pool, payload=payload)


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def document_detail_endpoint(
    document_id: str,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> DocumentDetailResponse:
    result = await get_document_detail(pool=db_pool, document_id=document_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    return result


@router.post(
    "/metadata-refresh",
    response_model=DocumentMetadataRefreshResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def refresh_document_metadata_endpoint(
    payload: DocumentMetadataRefreshRequest,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> DocumentMetadataRefreshResponse:
    result = await refresh_document_metadata(pool=db_pool, payload=payload)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found for the given source_type and external_id",
        )
    return result
