from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.clients.chat_completions import ChatCompletionsClient
from app.clients.embeddings import EmbeddingClient
from app.clients.vikunja import VikunjaClient
from app.config import get_settings
from app.database import build_pool
from app.routers.assistant import router as assistant_router
from app.routers.coverage import router as coverage_router
from app.routers.dashboard import router as dashboard_router
from app.routers.documents import router as documents_router
from app.routers.enrichment import router as enrichment_router
from app.routers.health import router as health_router
from app.routers.meetings import router as meetings_router
from app.routers.search import router as search_router
from app.routers.briefing import router as briefing_router
from app.routers.credits import router as credits_router
from app.routers.tasks import router as tasks_router
from app.routers.usage import router as usage_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    pool = build_pool(settings)
    await pool.open(wait=True)
    embedding_client = EmbeddingClient(
        api_url=settings.embedding_api_url,
        api_key=settings.embedding_api_key,
        model=settings.embedding_model,
        provider=settings.embedding_provider,
    )
    chat_client = ChatCompletionsClient(
        api_url=settings.llm_api_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
    )
    vikunja_client = VikunjaClient(
        base_url=settings.vikunja_url,
        api_token=settings.vikunja_api_token,
    )
    app.state.settings = settings
    app.state.db_pool = pool
    app.state.embedding_client = embedding_client
    app.state.chat_client = chat_client
    app.state.vikunja_client = vikunja_client
    try:
        yield
    finally:
        await pool.close()


app = FastAPI(
    title="Work Assistant API",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(dashboard_router)
app.include_router(documents_router)
app.include_router(enrichment_router)
app.include_router(search_router)
app.include_router(assistant_router)
app.include_router(tasks_router)
app.include_router(meetings_router)
app.include_router(coverage_router)
app.include_router(usage_router)
app.include_router(credits_router)
app.include_router(briefing_router)
