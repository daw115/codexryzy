from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthcheck(request: Request) -> dict[str, object]:
    async with request.app.state.db_pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute("SELECT 1 AS ok")
            row = await cursor.fetchone()

    return {
        "status": "ok",
        "database": "ok" if row and row["ok"] == 1 else "unknown",
        "environment": request.app.state.settings.app_env,
    }
