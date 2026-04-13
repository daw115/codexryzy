#!/usr/bin/env python3
"""Backfill public Google Drive `.msg` mail archive into the Work Assistant API."""

from __future__ import annotations

import sys

from mail_ingest_common import (
    DEFAULT_FOLDER_ID,
    env,
    extract_msg_payload,
    list_drive_entries,
    normalize_message_date,
)
from work_assistant_pipeline import (
    analyze_artifact,
    build_ingest_payload,
    document_exists,
    ingest_document,
    queue_enrichment_if_needed,
)


DRIVE_FOLDER_ID = env("DRIVE_FOLDER_ID", DEFAULT_FOLDER_ID)
BACKFILL_LIMIT = int(env("BACKFILL_LIMIT", "0"))
BACKFILL_OFFSET = int(env("BACKFILL_OFFSET", "0"))
PROMPT_VERSION = env("LLM_PROMPT_VERSION", "email-analysis.v1")


def analyze_mail(payload: dict[str, object]) -> tuple[dict, dict]:
    metadata_lines = [
        f"From: {payload['from'] or '(unknown)'}",
        f"To: {payload['to'] or '(unknown)'}",
        f"Cc: {payload['cc'] or '(none)'}",
        f"Date: {payload['date'] or '(unknown)'}",
        f"Message-ID: {payload['message_id'] or '(missing)'}",
        f"Modified label: {payload['modified_label']}",
        f"Source URL: {payload['source_url']}",
        f"Known emails: {', '.join(payload['email_addresses']) or '(none)'}",
    ]
    return analyze_artifact(
        artifact_type="email",
        title=str(payload["title"]),
        extracted_text=str(payload["extracted_text"]),
        metadata_lines=metadata_lines,
        prompt_version=PROMPT_VERSION,
    )


def main() -> int:
    entries = [entry for entry in list_drive_entries(DRIVE_FOLDER_ID) if entry["title"].lower().endswith(".msg")]
    entries.sort(key=lambda item: (item["title"].lower(), item["file_id"]))

    if BACKFILL_OFFSET:
        entries = entries[BACKFILL_OFFSET:]
    if BACKFILL_LIMIT > 0:
        entries = entries[:BACKFILL_LIMIT]

    print(f"Backfilling {len(entries)} mail(s) from Google Drive folder {DRIVE_FOLDER_ID}")

    processed = 0
    skipped = 0
    deduplicated = 0
    failed = 0

    for index, entry in enumerate(entries, start=1):
        try:
            if document_exists("google_drive", entry["file_id"]):
                skipped += 1
                print(f"[{index}/{len(entries)}] skipped (already ingested): {entry['title']}")
                continue

            payload = extract_msg_payload(entry)
            message_date_iso, message_date_day = normalize_message_date(str(payload.get("date") or ""))
            analysis, parsed = analyze_mail(payload)
            result = ingest_document(
                build_ingest_payload(
                    source_type="google_drive",
                    external_id=str(payload["file_id"]),
                    checksum=str(payload["checksum"]),
                    title=str(payload["title"]),
                    mime_type=str(payload["mime_type"]),
                    raw_storage_url=str(payload["source_url"]),
                    extracted_text=str(payload["extracted_text"]),
                    normalized_text=str(payload["body_text"] or payload["extracted_text"]).strip(),
                    source_metadata={
                        "drive_folder_id": DRIVE_FOLDER_ID,
                        "drive_file_id": payload["file_id"],
                        "drive_download_url": payload["download_url"],
                        "modified_label": payload["modified_label"],
                        "message_id": payload["message_id"],
                        "message_date_raw": payload["date"],
                        "message_date_iso": message_date_iso,
                        "message_date_day": message_date_day,
                    },
                    document_metadata={
                        "artifact_type": "email",
                        "normalized_title": payload["normalized_title"],
                        "headers_text": payload["headers_text"],
                        "from": payload["from"],
                        "to": payload["to"],
                        "cc": payload["cc"],
                        "date": payload["date"],
                        "message_date_raw": payload["date"],
                        "message_date_iso": message_date_iso,
                        "message_date_day": message_date_day,
                        "email_addresses": payload["email_addresses"],
                        "url_domains": payload["url_domains"],
                        "date_mentions": payload["date_mentions"],
                    },
                    analysis=analysis,
                    chunk_metadata_base={
                        "title": payload["title"],
                        "chunk_source": "mail_body",
                    },
                )
            )
            queue_enrichment_if_needed(
                parsed_analysis=parsed,
                source_document_id=result["document_id"],
                source_revision_id=result["revision_id"],
                notes=f"Auto-queued from mail ingest: {entry['title']}",
            )
            processed += 1
            if result["status"] == "deduplicated":
                deduplicated += 1
            print(
                f"[{index}/{len(entries)}] {result['status']}: "
                f"{entry['title']} -> doc {result['document_id']}"
            )
        except Exception as error:  # pragma: no cover - operational path
            failed += 1
            print(f"[{index}/{len(entries)}] failed: {entry['title']} :: {error}", file=sys.stderr)

    print(
        "Done. "
        f"processed={processed} skipped={skipped} deduplicated={deduplicated} failed={failed}"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
