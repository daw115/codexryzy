from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel

from app.database import get_db_pool
from app.security import require_api_key

router = APIRouter(prefix="/v1/briefing", tags=["briefing"], dependencies=[Depends(require_api_key)])


class BriefingResponse(BaseModel):
    briefing_date: str
    content: str
    model: str
    generated_at: str
    cached: bool = False


class BriefingGenerateRequest(BaseModel):
    force: bool = False  # regenerate even if today's briefing exists


@router.get("/today", response_model=BriefingResponse)
async def get_today_briefing(db_pool: AsyncConnectionPool = Depends(get_db_pool)) -> BriefingResponse:
    today = datetime.date.today().isoformat()
    async with db_pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT content, model, generated_at FROM daily_briefings WHERE briefing_date = %s",
                (today,),
            )
            row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No briefing for today yet")
    return BriefingResponse(
        briefing_date=today,
        content=row["content"],
        model=row["model"],
        generated_at=row["generated_at"].isoformat(),
        cached=True,
    )


@router.post("/generate", response_model=BriefingResponse)
async def generate_briefing(
    payload: BriefingGenerateRequest,
    request: Request,
    db_pool: AsyncConnectionPool = Depends(get_db_pool),
) -> BriefingResponse:
    today = datetime.date.today().isoformat()

    # Return cached unless force=True
    if not payload.force:
        async with db_pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT content, model, generated_at FROM daily_briefings WHERE briefing_date = %s",
                    (today,),
                )
                row = await cur.fetchone()
        if row:
            return BriefingResponse(
                briefing_date=today,
                content=row["content"],
                model=row["model"],
                generated_at=row["generated_at"].isoformat(),
                cached=True,
            )

    chat_client = request.app.state.chat_client
    if not chat_client.enabled:
        raise HTTPException(status_code=503, detail="LLM client not configured")

    # Load context: tasks + recent mails
    tasks_ctx, docs_ctx = await _load_briefing_context(db_pool)

    system_prompt = (
        "Jesteś asystentem pracy. Na podstawie zadań i maili przygotuj krótkie, treściwe podsumowanie dnia "
        "w języku polskim. Skup się na: co jest pilne dziś i w tym tygodniu, ważne tematy z ostatnich maili, "
        "czy są blokery lub działania wymagające odpowiedzi. Pisz w punktach, zwięźle."
    )
    user_prompt = f"Dzisiaj: {today}\n\n{tasks_ctx}\n\n{docs_ctx}"

    result = await chat_client.complete(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.3,
        max_tokens=800,
    )

    # Cache in DB
    async with db_pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO daily_briefings (briefing_date, content, model)
                VALUES (%s, %s, %s)
                ON CONFLICT (briefing_date) DO UPDATE
                    SET content = EXCLUDED.content,
                        model = EXCLUDED.model,
                        generated_at = NOW()
                RETURNING generated_at
                """,
                (today, result.text, result.model),
            )
            row = await cur.fetchone()

    # Log usage
    try:
        from app.services.usage import record_llm_usage
        from app.schemas import LlmUsageLogRequest
        await record_llm_usage(
            pool=db_pool,
            payload=LlmUsageLogRequest(
                model=result.model, endpoint="briefing",
                prompt_tokens=result.prompt_tokens,
                completion_tokens=result.completion_tokens,
                total_tokens=result.total_tokens,
            ),
        )
    except Exception:
        pass

    return BriefingResponse(
        briefing_date=today,
        content=result.text,
        model=result.model,
        generated_at=row["generated_at"].isoformat() if row else today,
        cached=False,
    )


async def _load_briefing_context(pool: AsyncConnectionPool) -> tuple[str, str]:
    tasks_lines = ["ZADANIA:"]
    docs_lines = ["OSTATNIE MAILE (streszczenia):"]

    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            # Tasks overdue + due this week
            await cur.execute(
                """
                SELECT title, due_at, priority, status FROM tasks_mirror
                WHERE status = 'open'
                ORDER BY
                    CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,
                    due_at ASC NULLS LAST
                LIMIT 20
                """
            )
            for row in await cur.fetchall():
                due = row["due_at"].strftime("%Y-%m-%d") if row["due_at"] else "bez terminu"
                tasks_lines.append(f"- [{due}] {row['title']}")

            # Recent email summaries
            await cur.execute(
                """
                SELECT d.title,
                       COALESCE(d.metadata->>'message_date_day', r.metadata->>'message_date_day') AS msg_day,
                       a.summary, a.priority, a.category
                FROM documents d
                LEFT JOIN document_revisions r ON r.id = d.current_revision_id
                LEFT JOIN LATERAL (
                    SELECT summary, priority, category FROM document_analyses
                    WHERE revision_id = r.id ORDER BY created_at DESC LIMIT 1
                ) a ON true
                WHERE COALESCE(d.metadata->>'artifact_type', r.metadata->>'artifact_type') = 'email'
                ORDER BY d.created_at DESC
                LIMIT 15
                """
            )
            for row in await cur.fetchall():
                day = row["msg_day"] or "?"
                summary = (row["summary"] or "")[:200]
                docs_lines.append(f"- [{day}] {row['title']}: {summary}")

    return "\n".join(tasks_lines), "\n".join(docs_lines)
