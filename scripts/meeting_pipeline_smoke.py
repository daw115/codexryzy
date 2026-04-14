#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from urllib import request


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


def call_api(base_url: str, api_key: str, method: str, path: str, body: dict | None = None) -> dict:
    url = f"{base_url.rstrip('/')}{path}"
    data = None
    headers = {"X-API-Key": api_key, "Content-Type": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = request.Request(url, data=data, headers=headers, method=method)
    with request.urlopen(req, timeout=60) as resp:
        payload = resp.read().decode("utf-8")
        return json.loads(payload) if payload else {}


def main() -> int:
    try:
        base_url = require_env("WORK_ASSISTANT_API_URL")
        api_key = require_env("WORK_ASSISTANT_API_KEY")
    except RuntimeError as error:
        print(f"ERROR: {error}")
        return 1

    now = datetime.now(timezone.utc)
    external_id = f"smoke-meeting-{now.strftime('%Y%m%d-%H%M%S')}"
    meeting_day = now.date().isoformat()

    print("1) Intake meeting...")
    intake = call_api(
        base_url,
        api_key,
        "POST",
        "/v1/meetings/intake",
        {
            "source_type": "manual_upload",
            "external_id": external_id,
            "title": "Smoke Test Meeting",
            "meeting_date": meeting_day,
            "project": "Smoke",
            "summary": "Spotkanie testowe pipeline.",
            "transcript": (
                "Ustalenia: przygotować demo dashboardu i zamknąć checklistę wdrożeniową.\n"
                "Action item: Demo dashboard do jutra (owner: DA).\n"
                "Action item: Checklistę deployu zamknąć dziś."
            ),
            "action_items": [
                {"title": "Demo dashboard", "owner": "DA", "due_at": meeting_day, "priority": 4},
                {"title": "Checklista deployu", "owner": "DA", "priority": 3},
            ],
            "auto_sync_tasks": True,
        },
    )
    document_id = intake.get("document_id")
    print(
        "   status="
        f"{intake.get('status')} document_id={document_id} "
        f"actions={intake.get('action_items_detected')} "
        f"mirrored={intake.get('mirrored_tasks')} synced={intake.get('vikunja_synced')}"
    )

    if not document_id:
        print("ERROR: intake did not return document_id")
        return 2

    print("2) Query meetings...")
    queried = call_api(
        base_url,
        api_key,
        "GET",
        f"/v1/meetings/query?limit=10&search_text={external_id}",
    )
    meetings = queried.get("meetings", [])
    print(f"   found={len(meetings)}")
    if not meetings:
        print("ERROR: meeting not found in query")
        return 3

    print("3) Rebuild tasks...")
    rebuild = call_api(
        base_url,
        api_key,
        "POST",
        f"/v1/meetings/{document_id}/rebuild-tasks",
        {"project_id": None},
    )
    print(
        "   action_items="
        f"{rebuild.get('action_items_detected')} "
        f"mirrored={rebuild.get('mirrored_tasks')} "
        f"synced={rebuild.get('vikunja_synced')} "
        f"errors={len(rebuild.get('sync_errors', []))}"
    )

    print("OK: meeting pipeline smoke test passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
