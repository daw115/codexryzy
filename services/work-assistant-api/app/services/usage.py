from psycopg_pool import AsyncConnectionPool

from app.schemas import LlmUsageLogRequest


async def record_llm_usage(
    *,
    pool: AsyncConnectionPool,
    payload: LlmUsageLogRequest,
) -> None:
    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                INSERT INTO llm_usage_log (model, endpoint, prompt_tokens, completion_tokens, total_tokens)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    payload.model,
                    payload.endpoint,
                    payload.prompt_tokens,
                    payload.completion_tokens,
                    payload.total_tokens,
                ),
            )
