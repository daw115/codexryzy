#!/usr/bin/env python3
"""Process queued web enrichment jobs into the Work Assistant knowledge base."""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from psycopg import connect
from psycopg.rows import dict_row

from work_assistant_pipeline import (
    analyze_artifact,
    build_ingest_payload,
    env,
    http_json,
    ingest_document,
)


DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
SEARCH_API_URL = env("SEARCH_API_URL", "https://api.tavily.com/search")
SEARCH_API_KEY = os.environ.get("SEARCH_API_KEY", "").strip()
SEARCH_PROVIDER = env("SEARCH_PROVIDER", "tavily").lower()
ENRICHMENT_BATCH_SIZE = int(env("ENRICHMENT_BATCH_SIZE", "5"))
ENRICHMENT_POLL_INTERVAL_SECONDS = int(env("ENRICHMENT_POLL_INTERVAL_SECONDS", "0"))
USER_AGENT = "Mozilla/5.0 (compatible; WorkAssistantBot/1.0)"


def fetch_pending_jobs(limit: int) -> list[dict]:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required for the enrichment worker")

    with connect(DATABASE_URL, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    ej.id::text AS id,
                    ej.topic_id::text AS topic_id,
                    kt.name AS topic_name,
                    ej.source_document_id::text AS source_document_id,
                    ej.source_revision_id::text AS source_revision_id,
                    ej.query_text,
                    ej.search_queries,
                    ej.allow_domains,
                    ej.freshness_days,
                    ej.max_results,
                    ej.notes
                FROM enrichment_jobs ej
                LEFT JOIN knowledge_topics kt ON kt.id = ej.topic_id
                WHERE ej.status = 'pending' AND ej.job_type = 'web_research'
                ORDER BY ej.created_at ASC
                LIMIT %s
                """,
                (limit,),
            )
            return cursor.fetchall()


def mark_job_running(job_id: str) -> None:
    with connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE enrichment_jobs
                SET status = 'running', started_at = NOW(), updated_at = NOW()
                WHERE id = %s::uuid
                """,
                (job_id,),
            )


def mark_job_complete(job_id: str, *, result_count: int, metadata: dict) -> None:
    with connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE enrichment_jobs
                SET
                    status = 'completed',
                    result_count = %s,
                    metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb,
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s::uuid
                """,
                (result_count, json.dumps(metadata), job_id),
            )


def mark_job_failed(job_id: str, *, error_message: str) -> None:
    with connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE enrichment_jobs
                SET
                    status = 'failed',
                    metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb,
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s::uuid
                """,
                (json.dumps({"error": error_message}), job_id),
            )


def link_document_to_topic(*, document_id: str, revision_id: str, topic_id: str | None, origin: str) -> None:
    if not topic_id:
        return
    with connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO document_topics (
                    document_id,
                    revision_id,
                    topic_id,
                    confidence,
                    origin,
                    metadata,
                    created_at
                )
                VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, '{}'::jsonb, NOW())
                """,
                (document_id, revision_id, topic_id, None, origin),
            )


def search_web(job: dict) -> list[dict]:
    if SEARCH_PROVIDER != "tavily":
        raise RuntimeError(f"Unsupported SEARCH_PROVIDER: {SEARCH_PROVIDER}")
    if not SEARCH_API_KEY:
        raise RuntimeError("SEARCH_API_KEY is required for web enrichment")

    queries = [query for query in (job.get("search_queries") or []) if query]
    if not queries and job.get("query_text"):
        queries = [job["query_text"]]
    if not queries:
        queries = [job.get("topic_name") or "latest updates"]

    all_results: list[dict] = []
    for query in queries:
        response = http_json(
            "POST",
            SEARCH_API_URL,
            body={
                "query": query,
                "max_results": job.get("max_results") or 10,
                "topic": "general",
            },
            headers={"Authorization": f"Bearer {SEARCH_API_KEY}"},
        )
        results = response.get("results") or []
        for result in results:
            url = (result.get("url") or "").strip()
            if not url:
                continue
            all_results.append(
                {
                    "query": query,
                    "url": url,
                    "title": (result.get("title") or url).strip(),
                    "content": (result.get("content") or result.get("raw_content") or "").strip(),
                }
            )
    return all_results


def filter_results(results: list[dict], allow_domains: list[str]) -> list[dict]:
    seen: set[str] = set()
    filtered: list[dict] = []
    for result in results:
        url = result["url"]
        domain = urllib.parse.urlparse(url).netloc.lower()
        if allow_domains and not any(domain == allowed or domain.endswith("." + allowed) for allowed in allow_domains):
            continue
        if url in seen:
            continue
        seen.add(url)
        result["domain"] = domain
        filtered.append(result)
    return filtered


def fetch_page_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read().decode("utf-8", errors="ignore")
    raw = re.sub(r"<script[\s\S]*?</script>", " ", raw, flags=re.I)
    raw = re.sub(r"<style[\s\S]*?</style>", " ", raw, flags=re.I)
    raw = re.sub(r"</(p|div|li|section|article|h1|h2|h3|h4|h5|h6|tr)>", "\n", raw, flags=re.I)
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.I)
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = html.unescape(raw)
    raw = re.sub(r"[ \t]+", " ", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip()[:40000]


def checksum_text(*parts: str) -> str:
    digest = hashlib.sha256()
    for part in parts:
        digest.update(part.encode("utf-8", errors="ignore"))
    return digest.hexdigest()


def process_job(job: dict) -> int:
    mark_job_running(job["id"])

    results = search_web(job)
    allow_domains = [domain.lower() for domain in (job.get("allow_domains") or []) if domain]
    results = filter_results(results, allow_domains=allow_domains)

    ingested = 0
    ingested_urls: list[str] = []
    for result in results[: job.get("max_results") or 10]:
        page_text = result["content"] or fetch_page_text(result["url"])
        if not page_text:
            continue

        extracted_text = "\n".join(
            [
                f"Title: {result['title']}",
                f"URL: {result['url']}",
                f"Domain: {result['domain']}",
                f"Topic: {job.get('topic_name') or '(unknown)'}",
                "",
                page_text,
            ]
        ).strip()
        analysis, parsed = analyze_artifact(
            artifact_type="web_research",
            title=result["title"],
            extracted_text=extracted_text,
            metadata_lines=[
                f"Source URL: {result['url']}",
                f"Domain: {result['domain']}",
                f"Origin topic: {job.get('topic_name') or '(unknown)'}",
                f"Search query: {result['query']}",
            ],
            prompt_version="web-enrichment.v1",
        )

        ingest_result = ingest_document(
            build_ingest_payload(
                source_type="web_research",
                external_id=f"web:{result['url']}",
                checksum=checksum_text(result["url"], extracted_text),
                title=result["title"],
                mime_type="text/html",
                raw_storage_url=result["url"],
                extracted_text=extracted_text,
                normalized_text=page_text,
                source_metadata={
                    "enrichment_job_id": job["id"],
                    "origin_topic_id": job.get("topic_id"),
                    "origin_topic_name": job.get("topic_name"),
                    "source_url": result["url"],
                    "domain": result["domain"],
                    "search_query": result["query"],
                },
                document_metadata={
                    "artifact_type": "web_research",
                    "domain": result["domain"],
                    "query": result["query"],
                    "topics": parsed.get("topics") or [],
                },
                analysis=analysis,
                chunk_metadata_base={
                    "title": result["title"],
                    "chunk_source": "web_research_body",
                    "domain": result["domain"],
                },
            )
        )

        link_document_to_topic(
            document_id=ingest_result["document_id"],
            revision_id=ingest_result["revision_id"],
            topic_id=job.get("topic_id"),
            origin="web_enrichment",
        )
        ingested += 1
        ingested_urls.append(result["url"])

    mark_job_complete(
        job["id"],
        result_count=ingested,
        metadata={"ingested_urls": ingested_urls},
    )
    return ingested


def main() -> int:
    while True:
        jobs = fetch_pending_jobs(ENRICHMENT_BATCH_SIZE)
        if not jobs:
            print("No pending enrichment jobs.")
            if ENRICHMENT_POLL_INTERVAL_SECONDS <= 0:
                return 0
            time.sleep(ENRICHMENT_POLL_INTERVAL_SECONDS)
            continue

        processed = 0
        failed = 0
        for job in jobs:
            try:
                count = process_job(job)
                processed += 1
                print(f"Processed enrichment job {job['id']} topic={job.get('topic_name')} docs={count}")
            except Exception as error:  # pragma: no cover - operational path
                failed += 1
                mark_job_failed(job["id"], error_message=str(error))
                print(f"Failed enrichment job {job['id']}: {error}", file=sys.stderr)

        print(f"Done. processed_jobs={processed} failed_jobs={failed}")
        if ENRICHMENT_POLL_INTERVAL_SECONDS <= 0:
            return 0 if failed == 0 else 1
        time.sleep(ENRICHMENT_POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
