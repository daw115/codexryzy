#!/usr/bin/env python3
"""Ingest local office documents into the Work Assistant API."""

from __future__ import annotations

import sys
from pathlib import Path

from document_extractors import extract_document_payload, supported_path
from work_assistant_pipeline import (
    analyze_artifact,
    build_ingest_payload,
    ingest_document,
    queue_enrichment_if_needed,
)


PROMPT_VERSION = "document-analysis.v1"


def iter_input_files(paths: list[str]) -> list[Path]:
    discovered: list[Path] = []
    for raw_path in paths:
        path = Path(raw_path).expanduser().resolve()
        if path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file() and supported_path(child):
                    discovered.append(child)
            continue
        if path.is_file() and supported_path(path):
            discovered.append(path)
    return discovered


def analyze_document_payload(payload: dict[str, object]) -> tuple[dict, dict]:
    metadata_lines = [
        f"File name: {payload['document_metadata'].get('artifact_type')}::{payload['title']}",
        f"MIME type: {payload['mime_type']}",
        f"Source path: {payload['raw_storage_url']}",
    ]
    return analyze_artifact(
        artifact_type=str(payload["document_metadata"].get("artifact_type") or payload["source_type"]),
        title=str(payload["title"]),
        extracted_text=str(payload["extracted_text"]),
        metadata_lines=metadata_lines,
        prompt_version=PROMPT_VERSION,
    )


def main(argv: list[str]) -> int:
    if not argv:
        print("Usage: python3 ingest_documents_to_work_assistant.py <file-or-directory> [...]", file=sys.stderr)
        return 1

    files = iter_input_files(argv)
    if not files:
        print("No supported documents found.", file=sys.stderr)
        return 1

    print(f"Ingesting {len(files)} document(s)")

    processed = 0
    deduplicated = 0
    failed = 0

    for index, path in enumerate(files, start=1):
        try:
            extracted = extract_document_payload(path)
            analysis, parsed = analyze_document_payload(extracted)
            ingest_payload = build_ingest_payload(
                source_type=str(extracted["source_type"]),
                external_id=str(extracted["external_id"]),
                checksum=str(extracted["checksum"]),
                title=str(extracted["title"]),
                mime_type=str(extracted["mime_type"]),
                raw_storage_url=str(extracted["raw_storage_url"]),
                extracted_text=str(extracted["extracted_text"]),
                normalized_text=str(extracted["normalized_text"]),
                source_metadata=dict(extracted["source_metadata"]),
                document_metadata=dict(extracted["document_metadata"]),
                analysis=analysis,
                chunk_metadata_base={
                    "title": extracted["title"],
                    "chunk_source": extracted["document_metadata"].get("artifact_type", "document_body"),
                },
            )
            result = ingest_document(ingest_payload)
            queue_enrichment_if_needed(
                parsed_analysis=parsed,
                source_document_id=result["document_id"],
                source_revision_id=result["revision_id"],
                notes=f"Auto-queued from document ingest: {path.name}",
            )

            processed += 1
            if result["status"] == "deduplicated":
                deduplicated += 1
            print(f"[{index}/{len(files)}] {result['status']}: {path.name} -> doc {result['document_id']}")
        except Exception as error:  # pragma: no cover - operational path
            failed += 1
            print(f"[{index}/{len(files)}] failed: {path} :: {error}", file=sys.stderr)

    print(f"Done. processed={processed} deduplicated={deduplicated} failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
