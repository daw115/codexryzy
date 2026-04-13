from __future__ import annotations

import re
from datetime import datetime
from email.utils import parsedate_to_datetime

from psycopg_pool import AsyncConnectionPool

from app.schemas import (
    LlmUsagePeriod,
    LlmUsageSummary,
    MailCoverageDay,
    MailCoverageDocument,
    MailCoverageSummary,
    MailCoverageResponse,
)


def _normalize_message_day(raw: str | None, iso: str | None = None) -> str | None:
    for candidate in [iso, raw]:
        value = (candidate or "").strip()
        if not value:
            continue

        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.date().isoformat()
        except Exception:
            pass

        try:
            parsed = parsedate_to_datetime(re.sub(r"\s+\([^)]+\)\s*$", "", value).strip())
            return parsed.date().isoformat()
        except Exception:
            pass

        numeric = re.search(r"\b(\d{4})[./-](\d{2})[./-](\d{2})\b", value)
        if numeric:
            year, month, day = numeric.groups()
            return f"{year}-{month}-{day}"

        european = re.search(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b", value)
        if european:
            day, month, year = european.groups()
            year = year if len(year) == 4 else f"20{year}"
            try:
                parsed = datetime(int(year), int(month), int(day))
            except ValueError:
                continue
            return parsed.date().isoformat()
    return None


async def get_mail_coverage(
    *,
    pool: AsyncConnectionPool,
    day_limit: int = 60,
    document_limit: int = 30,
) -> MailCoverageResponse:
    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                SELECT
                    d.id::text AS document_id,
                    d.title,
                    d.created_at AS ingested_at,
                    s.metadata->>'modified_label' AS source_modified_label,
                    COALESCE(
                        d.metadata->>'message_date_day',
                        r.metadata->>'message_date_day'
                    ) AS message_date_day,
                    COALESCE(
                        d.metadata->>'message_date_iso',
                        r.metadata->>'message_date_iso'
                    ) AS message_date_iso,
                    COALESCE(
                        d.metadata->>'message_date_raw',
                        d.metadata->>'date',
                        r.metadata->>'message_date_raw',
                        r.metadata->>'date'
                    ) AS message_date_raw
                FROM documents d
                JOIN sources s ON s.id = d.source_id
                LEFT JOIN document_revisions r ON r.id = d.current_revision_id
                WHERE
                    COALESCE(d.metadata->>'artifact_type', r.metadata->>'artifact_type') = 'email'
                    OR s.source_type IN ('google_drive', 'email')
                ORDER BY d.created_at DESC
                """
            )
            rows = await cursor.fetchall()

    day_counts: dict[str, int] = {}
    recent_documents: list[MailCoverageDocument] = []
    undated_email_documents = 0

    for row in rows:
        normalized_day = row["message_date_day"] or _normalize_message_day(
            row["message_date_raw"],
            row["message_date_iso"],
        )
        if normalized_day:
            day_counts[normalized_day] = day_counts.get(normalized_day, 0) + 1
        else:
            undated_email_documents += 1

        if len(recent_documents) < document_limit:
            recent_documents.append(
                MailCoverageDocument(
                    document_id=row["document_id"],
                    title=row["title"],
                    message_day=normalized_day,
                    message_date_raw=row["message_date_raw"],
                    source_modified_label=row["source_modified_label"],
                    ingested_at=row["ingested_at"],
                )
            )

    sorted_days = sorted(day_counts.items(), reverse=True)
    return MailCoverageResponse(
        total_email_documents=len(rows),
        covered_days_count=len(day_counts),
        undated_email_documents=undated_email_documents,
        earliest_message_day=min(day_counts) if day_counts else None,
        latest_message_day=max(day_counts) if day_counts else None,
        days=[MailCoverageDay(day=day, count=count) for day, count in sorted_days[:day_limit]],
        recent_documents=recent_documents,
    )


async def get_mail_coverage_summary(pool: AsyncConnectionPool) -> MailCoverageSummary:
    full = await get_mail_coverage(pool=pool, day_limit=1, document_limit=1)
    return MailCoverageSummary(
        total_email_documents=full.total_email_documents,
        covered_days_count=full.covered_days_count,
        undated_email_documents=full.undated_email_documents,
        earliest_message_day=full.earliest_message_day,
        latest_message_day=full.latest_message_day,
    )


async def get_llm_usage_summary(
    pool: AsyncConnectionPool,
    quota_monthly_tokens: int | None = None,
) -> LlmUsageSummary:
    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                SELECT
                    COALESCE(SUM(prompt_tokens) FILTER (WHERE called_at >= CURRENT_DATE), 0)           AS today_prompt,
                    COALESCE(SUM(completion_tokens) FILTER (WHERE called_at >= CURRENT_DATE), 0)       AS today_completion,
                    COALESCE(SUM(total_tokens) FILTER (WHERE called_at >= CURRENT_DATE), 0)            AS today_total,
                    COALESCE(COUNT(*) FILTER (WHERE called_at >= CURRENT_DATE), 0)                     AS today_calls,

                    COALESCE(SUM(prompt_tokens) FILTER (WHERE called_at >= DATE_TRUNC('month', NOW())), 0)        AS month_prompt,
                    COALESCE(SUM(completion_tokens) FILTER (WHERE called_at >= DATE_TRUNC('month', NOW())), 0)    AS month_completion,
                    COALESCE(SUM(total_tokens) FILTER (WHERE called_at >= DATE_TRUNC('month', NOW())), 0)         AS month_total,
                    COALESCE(COUNT(*) FILTER (WHERE called_at >= DATE_TRUNC('month', NOW())), 0)                  AS month_calls,

                    COALESCE(SUM(prompt_tokens), 0)     AS all_prompt,
                    COALESCE(SUM(completion_tokens), 0) AS all_completion,
                    COALESCE(SUM(total_tokens), 0)      AS all_total,
                    COALESCE(COUNT(*), 0)               AS all_calls
                FROM llm_usage_log
                """
            )
            row = await cursor.fetchone()

    month_total = int(row["month_total"])
    quota_remaining: int | None = None
    if quota_monthly_tokens is not None:
        quota_remaining = max(0, quota_monthly_tokens - month_total)

    return LlmUsageSummary(
        today=LlmUsagePeriod(
            prompt_tokens=int(row["today_prompt"]),
            completion_tokens=int(row["today_completion"]),
            total_tokens=int(row["today_total"]),
            calls=int(row["today_calls"]),
        ),
        this_month=LlmUsagePeriod(
            prompt_tokens=int(row["month_prompt"]),
            completion_tokens=int(row["month_completion"]),
            total_tokens=int(row["month_total"]),
            calls=int(row["month_calls"]),
        ),
        all_time=LlmUsagePeriod(
            prompt_tokens=int(row["all_prompt"]),
            completion_tokens=int(row["all_completion"]),
            total_tokens=int(row["all_total"]),
            calls=int(row["all_calls"]),
        ),
        quota_monthly_tokens=quota_monthly_tokens,
        quota_remaining_tokens=quota_remaining,
    )
