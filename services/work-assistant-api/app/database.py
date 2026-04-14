from collections.abc import AsyncIterator

from fastapi import Request
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import Settings


def build_pool(settings: Settings) -> AsyncConnectionPool:
    return AsyncConnectionPool(
        conninfo=settings.database_url,
        min_size=settings.database_min_pool_size,
        max_size=settings.database_max_pool_size,
        open=False,
        kwargs={
            "autocommit": False,
            "row_factory": dict_row,
        },
    )


async def get_db_pool(request: Request) -> AsyncIterator[AsyncConnectionPool]:
    yield request.app.state.db_pool
