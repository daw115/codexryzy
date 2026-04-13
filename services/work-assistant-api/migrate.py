#!/usr/bin/env python3
"""Apply SQL migrations for the Work Assistant database."""

from __future__ import annotations

import os
from pathlib import Path

from psycopg import connect


def main() -> int:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    sql_dir = Path(__file__).resolve().parent / "sql"
    migration_files = sorted(sql_dir.glob("*.sql"))
    if not migration_files:
        print("No migration files found.")
        return 0

    with connect(database_url) as connection:
        with connection.cursor() as cursor:
            for migration_file in migration_files:
                sql = migration_file.read_text(encoding="utf-8")
                cursor.execute(sql)
                print(f"Applied {migration_file.name}")
        connection.commit()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
