#!/usr/bin/env python3
"""Refresh metadata for already-ingested Google Drive `.msg` mails without re-running Claude."""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from mail_ingest_common import (
    DEFAULT_FOLDER_ID,
    env,
    extract_msg_payload,
    list_drive_entries,
    normalize_message_date,
)
from work_assistant_pipeline import http_json


DRIVE_FOLDER_ID = env("DRIVE_FOLDER_ID", DEFAULT_FOLDER_ID)
WORK_ASSISTANT_API_URL = env("WORK_ASSISTANT_API_URL", "http://localhost:8080").rstrip("/")
WORK_ASSISTANT_API_KEY = env("WORK_ASSISTANT_API_KEY", "")
REFRESH_LIMIT = int(env("REFRESH_LIMIT", "0"))
REFRESH_OFFSET = int(env("REFRESH_OFFSET", "0"))
REFRESH_WORKERS = int(env("REFRESH_WORKERS", "4"))

_print_lock = threading.Lock()


def _log(message: str) -> None:
    with _print_lock:
        print(message, flush=True)


def refresh_entry(index: int, total: int, entry: dict[str, str]) -> str:
    try:
        payload = extract_msg_payload(entry)
        message_date_iso, message_date_day = normalize_message_date(str(payload.get("date") or ""))
        has_relevant_metadata = any(
            [
                message_date_day,
                payload.get("message_id"),
                payload.get("from"),
                payload.get("to"),
                payload.get("cc"),
                payload.get("headers_text"),
            ]
        )
        if not has_relevant_metadata:
            _log(f"[{index}/{total}] no-metadata: {entry['title']}")
            return "no_metadata"

        body = {
            "source_type": "google_drive",
            "external_id": str(payload["file_id"]),
            "source_metadata": {
                "drive_folder_id": DRIVE_FOLDER_ID,
                "drive_file_id": payload["file_id"],
                "drive_download_url": payload["download_url"],
                "modified_label": payload["modified_label"],
                "message_id": payload["message_id"],
                "message_date_raw": payload["date"],
                "message_date_iso": message_date_iso,
                "message_date_day": message_date_day,
            },
            "document_metadata": {
                "artifact_type": "email",
                "normalized_title": payload["normalized_title"],
                "headers_text": payload["headers_text"],
                "from": payload["from"],
                "to": payload["to"],
                "cc": payload["cc"],
                "date": payload["date"],
                "message_id": payload["message_id"],
                "message_date_raw": payload["date"],
                "message_date_iso": message_date_iso,
                "message_date_day": message_date_day,
                "email_addresses": payload["email_addresses"],
                "url_domains": payload["url_domains"],
                "date_mentions": payload["date_mentions"],
            },
        }

        headers = {"X-API-Key": WORK_ASSISTANT_API_KEY} if WORK_ASSISTANT_API_KEY else {}
        try:
            result = http_json(
                "POST",
                f"{WORK_ASSISTANT_API_URL}/v1/documents/metadata-refresh",
                body=body,
                headers=headers,
                timeout=60,
            )
        except RuntimeError as error:
            if "HTTP 404" in str(error):
                _log(f"[{index}/{total}] missing-doc: {entry['title']}")
                return "missing_doc"
            raise

        _log(
            f"[{index}/{total}] refreshed: {entry['title']} -> doc {result['document_id']} "
            f"(day={message_date_day or 'n/a'})"
        )
        return "refreshed"
    except Exception as error:
        _log(f"[{index}/{total}] FAILED: {entry['title']} :: {error}")
        return "failed"


def main() -> int:
    entries = [entry for entry in list_drive_entries(DRIVE_FOLDER_ID) if entry["title"].lower().endswith(".msg")]
    entries.sort(key=lambda item: (item["title"].lower(), item["file_id"]))

    if REFRESH_OFFSET:
        entries = entries[REFRESH_OFFSET:]
    if REFRESH_LIMIT > 0:
        entries = entries[:REFRESH_LIMIT]

    total = len(entries)
    print(f"Refreshing metadata for {total} mail(s) from Google Drive folder {DRIVE_FOLDER_ID} [{REFRESH_WORKERS} workers]")

    counts = {"refreshed": 0, "no_metadata": 0, "missing_doc": 0, "failed": 0}
    with ThreadPoolExecutor(max_workers=REFRESH_WORKERS) as executor:
        futures = {
            executor.submit(refresh_entry, index, total, entry): entry
            for index, entry in enumerate(entries, start=1)
        }
        for future in as_completed(futures):
            status = future.result()
            counts[status] = counts.get(status, 0) + 1

    print(
        "Done. "
        f"refreshed={counts.get('refreshed', 0)} "
        f"no_metadata={counts.get('no_metadata', 0)} "
        f"missing_doc={counts.get('missing_doc', 0)} "
        f"failed={counts.get('failed', 0)}"
    )
    return 0 if counts.get("failed", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
