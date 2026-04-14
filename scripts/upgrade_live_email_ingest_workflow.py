#!/usr/bin/env python3
"""Patch the live n8n email ingest workflow to store mail in Work Assistant API."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


N8N_URL = os.environ.get("N8N_URL", "https://n8n-production-f1967.up.railway.app").rstrip("/")
N8N_API_KEY = os.environ.get("N8N_API_KEY", "").strip()
WORKFLOW_ID = os.environ.get("N8N_WORKFLOW_ID", "DSTCajsb1rXjMb5z").strip()

WORK_ASSISTANT_URL = os.environ.get(
    "WORK_ASSISTANT_API_URL",
    "https://work-assistant-api-production.up.railway.app",
).rstrip("/")
WORK_ASSISTANT_API_KEY = os.environ.get("WORK_ASSISTANT_API_KEY", "").strip()
WORK_ASSISTANT_CREDENTIAL_NAME = os.environ.get(
    "N8N_WORK_ASSISTANT_CREDENTIAL_NAME",
    "Work Assistant API Key",
).strip()
MODEL = os.environ.get("QUATARLY_MODEL", "claude-sonnet-4-6-20250929").strip()


PREPARE_WORK_ASSISTANT_DOCUMENT_JS = r"""
const analysis = $('Claude - Extract Task').item.json;
const source = $('Extract MSG Content').item.json;
const content = analysis?.choices?.[0]?.message?.content || '';

let parsed = {};
try {
  const match = content.match(/\{[\s\S]*\}/);
  if (match) parsed = JSON.parse(match[0]);
} catch (error) {
  parsed = {};
}

let dueDate = null;
if (parsed.due_date) {
  const parsedDate = new Date(parsed.due_date);
  if (!Number.isNaN(parsedDate.valueOf())) {
    dueDate = parsedDate.toISOString();
  }
}

const extractMessageDate = (text) => {
  const value = text || '';
  const patterns = [
    /(?:^|\n)Date:\s*([^\n]+)/i,
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?\s+[+\-]\d{4}\b/,
    /\b\d{4}[./-]\d{2}[./-]\d{2}\b/,
    /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const raw = (match[1] || match[0] || '').trim();
    if (!raw) continue;
    const parsed = new Date(raw.replace(/\s+\([^)]+\)\s*$/, ''));
    if (!Number.isNaN(parsed.valueOf())) {
      return {
        raw,
        iso: parsed.toISOString(),
        day: parsed.toISOString().slice(0, 10),
      };
    }
    const isoMatch = raw.match(/\b(\d{4})[./-](\d{2})[./-](\d{2})\b/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return { raw, iso: `${year}-${month}-${day}`, day: `${year}-${month}-${day}` };
    }
    const euMatch = raw.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
    if (euMatch) {
      let [, day, month, year] = euMatch;
      year = year.length === 4 ? year : `20${year}`;
      const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      return { raw, iso: normalized, day: normalized };
    }
    return { raw, iso: null, day: null };
  }
  return { raw: null, iso: null, day: null };
};

const normalizedText = (source.bodyText || source.extractedText || '').trim();
const safeTitle = (source.title || 'email.msg').replace(/\.msg$/i, '');
const checksum = [source.fileId, source.lastModifiedLabel || '', source.title || ''].join(':');
const messageDate = extractMessageDate(source.extractedText);

const analysisPayload = {
  model: '""" + MODEL + r"""',
  prompt_version: 'n8n-email-ingest.v1',
  summary: parsed.summary || `Imported email: ${safeTitle}`,
  category: parsed.category || 'general',
  priority: parsed.priority || (parsed.action_required ? 'medium' : 'low'),
  confidence: null,
  action_items: parsed.action_required ? [{
    title: parsed.title || `Review email: ${safeTitle}`,
    description: parsed.description || parsed.summary || '',
    owner: null,
    due_at: dueDate,
    priority: parsed.priority || null,
  }] : [],
  entities: [],
  deadlines: dueDate ? [{
    label: parsed.title || 'Extracted due date',
    date: dueDate,
    confidence: 0.6,
  }] : [],
  open_questions: [],
  metadata: {
    raw_response: parsed,
    fileId: source.fileId,
    sourceUrl: source.sourceUrl,
  },
};

return [{
  json: {
    source_type: 'google_drive',
    external_id: source.fileId,
    checksum,
    title: safeTitle,
    mime_type: 'application/vnd.ms-outlook',
    raw_storage_url: source.sourceUrl,
    extracted_text: source.extractedText,
    normalized_text: normalizedText || source.extractedText,
    language: null,
    source_metadata: {
      drive_file_id: source.fileId,
      modified_label: source.lastModifiedLabel,
      drive_view_url: source.sourceUrl,
      ingest_workflow: '5 - Email Ingest',
      message_date_raw: messageDate.raw,
      message_date_iso: messageDate.iso,
      message_date_day: messageDate.day,
    },
    document_metadata: {
      artifact_type: 'email',
      file_name: source.title,
      source_title: source.title,
      message_date_raw: messageDate.raw,
      message_date_iso: messageDate.iso,
      message_date_day: messageDate.day,
    },
    analysis: analysisPayload,
    chunks: [{
      chunk_index: 0,
      content: (normalizedText || source.extractedText).slice(0, 16000),
      token_count: Math.max(1, Math.ceil((normalizedText || source.extractedText).length / 4)),
      metadata: {
        chunk_source: 'mail_body',
        file_id: source.fileId,
      },
    }],
    tasks: [],
    skip_if_checksum_matches: true,
  },
}];
"""


PREPARE_VIKUNJA_TASK_JS = r"""
const analysis = $('Claude - Extract Task').item.json;
const source = $('Extract MSG Content').item.json;
const content = analysis?.choices?.[0]?.message?.content || '';

let task = {};
try {
  const match = content.match(/\{[\s\S]*\}/);
  if (match) task = JSON.parse(match[0]);
} catch (error) {
  task = {};
}

const priorityMap = { low: 1, medium: 2, high: 3, urgent: 4, critical: 4, now: 5 };
let priority = 2;
if (typeof task.priority === 'string') {
  priority = priorityMap[task.priority.toLowerCase()] ?? 2;
} else if (typeof task.priority === 'number') {
  priority = task.priority;
}

let dueDate = null;
if (task.due_date) {
  const parsed = new Date(task.due_date);
  if (!Number.isNaN(parsed.valueOf())) {
    dueDate = parsed.toISOString();
  }
}

const description = [
  `**Source file:** [${source.title}](${source.sourceUrl})`,
  `**Category:** ${task.category || 'General'}`,
  '',
  `**Summary:** ${task.summary || 'No summary returned by the model.'}`,
  '',
  task.description || source.bodyText,
].join('\n').trim();

return [{
  json: {
    fileId: source.fileId,
    sourceTitle: source.title,
    title: (task.title || `Review email: ${source.title.replace(/\.msg$/i, '')}`).substring(0, 100),
    description,
    due_date: dueDate,
    priority,
  },
}];
"""


PREPARE_WORK_ASSISTANT_USAGE_JS = r"""
const response = $('Claude - Extract Task').item.json || {};
const usage = response.usage || {};

return [{
  json: {
    model: response.model || '""" + MODEL + r"""',
    endpoint: 'n8n_email_ingest',
    prompt_tokens: Number(usage.prompt_tokens || 0),
    completion_tokens: Number(usage.completion_tokens || 0),
    total_tokens: Number(usage.total_tokens || 0),
  },
}];
"""


def n8n_request(method: str, path: str, body: dict | None = None) -> dict:
    headers = {
        "X-N8N-API-KEY": N8N_API_KEY,
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(f"{N8N_URL}/api/v1{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"{method} {path} failed with HTTP {error.code}: {payload}") from error


def ensure_work_assistant_credential() -> dict:
    credentials = n8n_request("GET", "/credentials").get("data", [])
    for credential in credentials:
        if credential["name"] == WORK_ASSISTANT_CREDENTIAL_NAME and credential["type"] == "httpHeaderAuth":
            return credential

    body = {
        "name": WORK_ASSISTANT_CREDENTIAL_NAME,
        "type": "httpHeaderAuth",
        "data": {
            "name": "X-API-Key",
            "value": WORK_ASSISTANT_API_KEY,
        },
    }
    return n8n_request("POST", "/credentials", body)


def upsert_node(nodes: list[dict], node: dict) -> list[dict]:
    for index, existing in enumerate(nodes):
        if existing["name"] == node["name"]:
            nodes[index] = node
            return nodes
    nodes.append(node)
    return nodes


def patch_workflow(workflow: dict, credential: dict) -> dict:
    nodes = workflow["nodes"]

    for node in nodes:
        if node["name"] == "Prepare Vikunja Task":
            node["parameters"]["jsCode"] = PREPARE_VIKUNJA_TASK_JS

    nodes = upsert_node(
        nodes,
        {
            "parameters": {"jsCode": PREPARE_WORK_ASSISTANT_DOCUMENT_JS},
            "id": "e5f6a7b8-0005-0005-0005-000000000012",
            "name": "Prepare Work Assistant Document",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [2480, 120],
        },
    )
    nodes = upsert_node(
        nodes,
        {
            "parameters": {"jsCode": PREPARE_WORK_ASSISTANT_USAGE_JS},
            "id": "e5f6a7b8-0005-0005-0005-000000000014",
            "name": "Prepare Work Assistant Usage",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [2480, -80],
        },
    )
    nodes = upsert_node(
        nodes,
        {
            "parameters": {
                "method": "POST",
                "url": f"{WORK_ASSISTANT_URL}/v1/documents/ingest",
                "authentication": "genericCredentialType",
                "genericAuthType": "httpHeaderAuth",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Content-Type", "value": "application/json"},
                    ]
                },
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify($json) }}",
                "options": {},
            },
            "id": "e5f6a7b8-0005-0005-0005-000000000013",
            "name": "Work Assistant - Ingest Document",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [2760, 120],
            "credentials": {
                "httpHeaderAuth": {
                    "id": credential["id"],
                    "name": credential["name"],
                }
            },
        },
    )
    nodes = upsert_node(
        nodes,
        {
            "parameters": {
                "method": "POST",
                "url": f"{WORK_ASSISTANT_URL}/v1/usage/llm",
                "authentication": "genericCredentialType",
                "genericAuthType": "httpHeaderAuth",
                "sendHeaders": True,
                "headerParameters": {
                    "parameters": [
                        {"name": "Content-Type", "value": "application/json"},
                    ]
                },
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify($json) }}",
                "options": {},
            },
            "id": "e5f6a7b8-0005-0005-0005-000000000015",
            "name": "Work Assistant - Log LLM Usage",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [2760, -80],
            "credentials": {
                "httpHeaderAuth": {
                    "id": credential["id"],
                    "name": credential["name"],
                }
            },
        },
    )

    workflow["nodes"] = nodes
    workflow["connections"]["Claude - Extract Task"] = {
        "main": [[
            {"node": "Prepare Work Assistant Document", "type": "main", "index": 0},
            {"node": "Prepare Work Assistant Usage", "type": "main", "index": 0},
        ]]
    }
    workflow["connections"]["Prepare Work Assistant Document"] = {
        "main": [[{"node": "Work Assistant - Ingest Document", "type": "main", "index": 0}]]
    }
    workflow["connections"]["Prepare Work Assistant Usage"] = {
        "main": [[{"node": "Work Assistant - Log LLM Usage", "type": "main", "index": 0}]]
    }
    workflow["connections"]["Work Assistant - Ingest Document"] = {
        "main": [[{"node": "Prepare Vikunja Task", "type": "main", "index": 0}]]
    }
    workflow["connections"]["Prepare Vikunja Task"] = {
        "main": [[{"node": "Vikunja - Create Task", "type": "main", "index": 0}]]
    }
    workflow["connections"]["Vikunja - Create Task"] = {
        "main": [[{"node": "Mark File As Processed", "type": "main", "index": 0}]]
    }
    return workflow


def build_update_body(workflow: dict) -> dict:
    return {
        "name": workflow["name"],
        "nodes": workflow["nodes"],
        "connections": workflow["connections"],
        "settings": workflow.get("settings") or {},
        "staticData": workflow.get("staticData") or {},
        "pinData": workflow.get("pinData") or {},
    }


def main() -> int:
    if not N8N_API_KEY:
        raise SystemExit("N8N_API_KEY is required")
    if not WORK_ASSISTANT_API_KEY:
        raise SystemExit("WORK_ASSISTANT_API_KEY is required")

    credential = ensure_work_assistant_credential()
    workflow = n8n_request("GET", f"/workflows/{WORKFLOW_ID}")
    patched = patch_workflow(workflow, credential)
    body = build_update_body(patched)
    result = n8n_request("PUT", f"/workflows/{WORKFLOW_ID}", body)

    print(
        json.dumps(
            {
                "workflowId": result["id"],
                "name": result["name"],
                "active": result["active"],
                "workAssistantCredential": {
                    "id": credential["id"],
                    "name": credential["name"],
                },
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
