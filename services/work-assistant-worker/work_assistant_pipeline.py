#!/usr/bin/env python3
"""Shared pipeline helpers for ingesting artifacts into the Work Assistant API."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def env(name: str, default: str) -> str:
    value = os.environ.get(name, default)
    return value.strip() or default


WORK_ASSISTANT_API_URL = env("WORK_ASSISTANT_API_URL", "http://localhost:8080").rstrip("/")
WORK_ASSISTANT_API_KEY = os.environ.get("WORK_ASSISTANT_API_KEY", "").strip()

LLM_API_URL = env("LLM_API_URL", "https://api.quatarly.cloud/v0/chat/completions")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "").strip()
LLM_MODEL = env("LLM_MODEL", "claude-sonnet-4-6-20250929")

EMBEDDING_API_URL = os.environ.get("EMBEDDING_API_URL", "").strip()
EMBEDDING_API_KEY = os.environ.get("EMBEDDING_API_KEY", "").strip()
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "").strip()

AUTO_QUEUE_ENRICHMENT = env("AUTO_QUEUE_ENRICHMENT", "false").lower() in {"1", "true", "yes", "on"}
ENRICH_ALLOW_DOMAINS = [
    domain.strip().lower()
    for domain in os.environ.get("ENRICH_ALLOW_DOMAINS", "").split(",")
    if domain.strip()
]
ENRICH_FRESHNESS_DAYS = int(env("ENRICH_FRESHNESS_DAYS", "180"))
ENRICH_MAX_RESULTS = int(env("ENRICH_MAX_RESULTS", "10"))
ENRICH_MAX_TOPICS = int(env("ENRICH_MAX_TOPICS", "3"))


def http_json(method: str, url: str, body: dict | None = None, headers: dict | None = None) -> dict:
    request_headers = {"Content-Type": "application/json"}
    if headers:
        request_headers.update(headers)

    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"{method} {url} failed with HTTP {error.code}: {payload}") from error


def log_llm_usage(*, model: str, endpoint: str, prompt_tokens: int, completion_tokens: int, total_tokens: int) -> None:
    if not (WORK_ASSISTANT_API_URL and WORK_ASSISTANT_API_KEY):
        return

    try:
        http_json(
            "POST",
            f"{WORK_ASSISTANT_API_URL}/v1/usage/llm",
            body={
                "model": model,
                "endpoint": endpoint,
                "prompt_tokens": max(0, int(prompt_tokens)),
                "completion_tokens": max(0, int(completion_tokens)),
                "total_tokens": max(0, int(total_tokens)),
            },
            headers={"X-API-Key": WORK_ASSISTANT_API_KEY},
        )
    except Exception:
        return


def parse_json_object(value: str) -> dict:
    stripped = value.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return json.loads(stripped)
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(stripped[start : end + 1])
    raise ValueError("No JSON object found in model output")


def estimate_token_count(text: str) -> int:
    return max(1, len(text) // 4)


def chunk_text(text: str, chunk_size: int = 1400, overlap: int = 200) -> list[str]:
    value = text.replace("\r", "")
    value = "\n".join(line.rstrip() for line in value.splitlines())
    value = "\n\n".join(part.strip() for part in value.split("\n\n") if part.strip())
    if not value:
        return []
    if overlap >= chunk_size:
        raise ValueError("chunk overlap must be smaller than chunk size")

    chunks: list[str] = []
    start = 0
    while start < len(value):
        end = min(len(value), start + chunk_size)
        if end < len(value):
            newline = value.rfind("\n", start, end)
            space = value.rfind(" ", start, end)
            pivot = max(newline, space)
            if pivot > start + chunk_size // 2:
                end = pivot
        chunk = value[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(value):
            break
        start = max(end - overlap, start + 1)
    return chunks


def embed_text(text: str) -> list[float] | None:
    if not (EMBEDDING_API_URL and EMBEDDING_API_KEY and EMBEDDING_MODEL):
        return None

    response = http_json(
        "POST",
        EMBEDDING_API_URL,
        body={
            "model": EMBEDDING_MODEL,
            "input": text,
        },
        headers={"Authorization": f"Bearer {EMBEDDING_API_KEY}"},
    )

    if isinstance(response.get("data"), list) and response["data"]:
        embedding = response["data"][0].get("embedding")
        if isinstance(embedding, list):
            return embedding
    if isinstance(response.get("embedding"), list):
        return response["embedding"]
    raise RuntimeError("Embedding API response did not contain an embedding vector")


def analyze_artifact(
    *,
    artifact_type: str,
    title: str,
    extracted_text: str,
    metadata_lines: list[str],
    prompt_version: str,
) -> tuple[dict, dict]:
    if not LLM_API_KEY:
        raise RuntimeError("LLM_API_KEY is required to analyze artifacts with Claude")

    system_prompt = (
        "You analyze work artifacts for a server-side knowledge base. "
        "Artifacts may be email, PDF, DOCX, XLSX, PPTX, spreadsheet or presentation content. "
        "Return only valid JSON. Do not use markdown. "
        "Schema: {"
        '"summary": string, '
        '"category": string, '
        '"priority": "low"|"normal"|"high"|"urgent", '
        '"participants": [{"name": string, "email": string|null, "role": string|null}], '
        '"organizations": [string], '
        '"topics": [string], '
        '"deadlines": [{"label": string, "date": string|null, "confidence": number}], '
        '"action_items": [{"title": string, "description": string, "owner": string|null, "due_at": string|null, "priority": string|null}], '
        '"open_questions": [string]'
        "}."
    )

    user_prompt = "\n".join(
        metadata_lines
        + [
            f"Artifact type: {artifact_type}",
            f"Title: {title}",
            "",
            "Artifact content:",
            extracted_text,
        ]
    )

    response = http_json(
        "POST",
        LLM_API_URL,
        body={
            "model": LLM_MODEL,
            "temperature": 0.1,
            "max_tokens": 1800,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
        },
        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
    )
    usage = response.get("usage") or {}
    log_llm_usage(
        model=str(response.get("model") or LLM_MODEL),
        endpoint=f"pipeline_{artifact_type}_analysis",
        prompt_tokens=int(usage.get("prompt_tokens") or 0),
        completion_tokens=int(usage.get("completion_tokens") or 0),
        total_tokens=int(usage.get("total_tokens") or 0),
    )

    content = response["choices"][0]["message"]["content"]
    parsed = parse_json_object(content)

    analysis = {
        "model": LLM_MODEL,
        "prompt_version": prompt_version,
        "summary": parsed.get("summary") or f"Artifact: {title}",
        "category": parsed.get("category"),
        "priority": parsed.get("priority"),
        "confidence": None,
        "action_items": parsed.get("action_items") or [],
        "entities": (
            [{"type": "person", **item} for item in parsed.get("participants") or []]
            + [{"type": "organization", "name": name} for name in parsed.get("organizations") or []]
            + [{"type": "topic", "name": name} for name in parsed.get("topics") or []]
        ),
        "deadlines": parsed.get("deadlines") or [],
        "open_questions": parsed.get("open_questions") or [],
        "metadata": {
            "raw_response": parsed,
        },
    }
    return analysis, parsed


def build_ingest_payload(
    *,
    source_type: str,
    external_id: str,
    checksum: str,
    title: str,
    mime_type: str,
    raw_storage_url: str | None,
    extracted_text: str,
    normalized_text: str,
    source_metadata: dict,
    document_metadata: dict,
    analysis: dict,
    chunk_metadata_base: dict,
    language: str | None = None,
    skip_if_checksum_matches: bool = True,
) -> dict:
    chunks = chunk_text(normalized_text)
    return {
        "source_type": source_type,
        "external_id": external_id,
        "checksum": checksum,
        "title": title,
        "mime_type": mime_type,
        "raw_storage_url": raw_storage_url,
        "extracted_text": extracted_text,
        "normalized_text": normalized_text,
        "language": language,
        "source_metadata": source_metadata,
        "document_metadata": document_metadata,
        "analysis": analysis,
        "chunks": [
            {
                "chunk_index": index,
                "content": chunk,
                "token_count": estimate_token_count(chunk),
                "embedding": embed_text(chunk),
                "metadata": {
                    **chunk_metadata_base,
                    "chunk_source": chunk_metadata_base.get("chunk_source", "body"),
                },
            }
            for index, chunk in enumerate(chunks)
        ],
        "tasks": [],
        "skip_if_checksum_matches": skip_if_checksum_matches,
    }


def ingest_document(payload: dict) -> dict:
    headers = {}
    if WORK_ASSISTANT_API_KEY:
        headers["X-API-Key"] = WORK_ASSISTANT_API_KEY
    return http_json(
        "POST",
        f"{WORK_ASSISTANT_API_URL}/v1/documents/ingest",
        body=payload,
        headers=headers,
    )
