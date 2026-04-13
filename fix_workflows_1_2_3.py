#!/usr/bin/env python3
"""
Fix n8n workflows 1, 2, 3 and import workflow 2 if missing.
Run this script on your local Mac.

Usage:
  python3 fix_workflows_1_2_3.py
"""

import json
import urllib.request
import urllib.error

# ── CONFIG — paste your values here ───────────────────────────────────────────
N8N_URL   = "https://n8n-production-f1967.up.railway.app"
JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NDU1NzRkZi05ZjViLTQ3NTgtYmI5Ny01NTJmOTQ2ZDlmMWIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMTg0OWRhOWUtMzI1ZS00MmZlLWFiODQtYTFkMGYxODk2NjFiIiwiaWF0IjoxNzc2MDQ3NjgxLCJleHAiOjE3Nzg1NTg0MDB9.bRK8m7YkoxVGd7uyICpp-9I_8KCgeCuu4g6nNBA0ht0"
API_KEY   = "qua-3fe84831eb5df3856a4790c2461ae1bf"
MODEL     = "claude-sonnet-4-6-20250929"
API_CHAT  = "https://api.quatarly.cloud/v1/chat/completions"
# ──────────────────────────────────────────────────────────────────────────────

HEADERS_AUTH = {
    "X-N8N-API-KEY": JWT_TOKEN,
    "Content-Type": "application/json",
}

def api(method, path, body=None):
    url = f"{N8N_URL}/api/v1{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=HEADERS_AUTH, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()}")
        raise

def list_workflows():
    return api("GET", "/workflows?limit=100")["data"]

def get_workflow(wf_id):
    return api("GET", f"/workflows/{wf_id}")

def put_workflow(wf_id, wf):
    body = {
        "name": wf["name"],
        "nodes": wf["nodes"],
        "connections": wf["connections"],
        "settings": {"executionOrder": wf.get("settings", {}).get("executionOrder", "v1")},
        "staticData": wf.get("staticData"),
    }
    return api("PUT", f"/workflows/{wf_id}", body)

def post_workflow(wf):
    body = {
        "name": wf["name"],
        "nodes": wf["nodes"],
        "connections": wf["connections"],
        "settings": {"executionOrder": wf.get("settings", {}).get("executionOrder", "v1")},
        "staticData": None,
    }
    return api("POST", "/workflows", body)

# ── Node fixers ────────────────────────────────────────────────────────────────

AUTH_HEADERS = {
    "parameters": [
        {"name": "Authorization", "value": f"Bearer {API_KEY}"},
        {"name": "Content-Type",  "value": "application/json"},
    ]
}

def fix_email_node(node):
    """Fix Claude - Summarize Email node in workflow 1."""
    node["parameters"] = {
        "method": "POST",
        "url": API_CHAT,
        "sendHeaders": True,
        "headerParameters": AUTH_HEADERS,
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": (
            "={{ JSON.stringify({"
            "model: '" + MODEL + "', "
            "max_tokens: 1024, "
            "messages: ["
            "{role: 'system', content: 'You are an email assistant. Summarize emails clearly and concisely. Extract: sender, subject, key points, required actions.'}, "
            "{role: 'user', content: $json.body.emailContent || $json.body.message || 'No content provided'}"
            "], "
            "stream: false"
            "}) }}"
        ),
        "options": {},
    }
    return node

def fix_document_node(node):
    """Fix Claude - Analyze Document node in workflow 2."""
    node["parameters"] = {
        "method": "POST",
        "url": API_CHAT,
        "sendHeaders": True,
        "headerParameters": AUTH_HEADERS,
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": (
            "={{ JSON.stringify({"
            "model: '" + MODEL + "', "
            "max_tokens: 2048, "
            "messages: ["
            "{role: 'system', content: 'You are a document analysis expert. Analyze the provided document and return a structured JSON response with: { \"summary\": string, \"key_points\": string[], \"action_items\": string[], \"sentiment\": string, \"topics\": string[] }'}, "
            "{role: 'user', content: 'Analyze this document:\\\\n\\\\n' + ($json.data || $json.body)}"
            "], "
            "stream: false"
            "}) }}"
        ),
        "options": {},
    }
    return node

def fix_briefing_node(node):
    """Fix Claude - Generate Briefing node in workflow 3."""
    node["parameters"] = {
        "method": "POST",
        "url": API_CHAT,
        "sendHeaders": True,
        "headerParameters": AUTH_HEADERS,
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": (
            "={{ JSON.stringify({"
            "model: '" + MODEL + "', "
            "max_tokens: 1024, "
            "messages: ["
            "{role: 'system', content: 'You are a personal productivity assistant. Create a concise, motivating daily briefing. Include: greeting, date, suggested focus areas for today, a productivity tip, and a motivational quote. Keep it under 200 words.'}, "
            "{role: 'user', content: 'Generate my daily briefing for ' + $now.toFormat('EEEE, MMMM d, yyyy') + '.'}"
            "], "
            "stream: false"
            "}) }}"
        ),
        "options": {},
    }
    return node

# ── Local workflow templates (for creating workflow 2 if missing) ──────────────

WF2_TEMPLATE = {
    "name": "2 - Document Analyzer",
    "nodes": [
        {
            "parameters": {
                "httpMethod": "POST",
                "path": "document-analyzer",
                "responseMode": "lastNode",
                "options": {}
            },
            "id": "b1b2c3d4-0002-0002-0002-000000000001",
            "name": "Webhook",
            "type": "n8n-nodes-base.webhook",
            "typeVersion": 2,
            "position": [240, 300],
            "webhookId": "document-analyzer"
        },
        {
            "parameters": {
                "method": "GET",
                "url": "={{ $json.body.fileUrl }}",
                "options": {"response": {"response": {"responseFormat": "text"}}}
            },
            "id": "b1b2c3d4-0002-0002-0002-000000000002",
            "name": "Fetch Document",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [480, 300]
        },
        {
            "parameters": {
                "method": "POST",
                "url": API_CHAT,
                "sendHeaders": True,
                "headerParameters": AUTH_HEADERS,
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": (
                    "={{ JSON.stringify({"
                    "model: '" + MODEL + "', "
                    "max_tokens: 2048, "
                    "messages: ["
                    "{role: 'system', content: 'You are a document analysis expert. Analyze the provided document and return a structured JSON response with: { \"summary\": string, \"key_points\": string[], \"action_items\": string[], \"sentiment\": string, \"topics\": string[] }'}, "
                    "{role: 'user', content: 'Analyze this document:\\\\n\\\\n' + ($json.data || $json.body)}"
                    "], "
                    "stream: false"
                    "}) }}"
                ),
                "options": {},
            },
            "id": "b1b2c3d4-0002-0002-0002-000000000003",
            "name": "Claude - Analyze Document",
            "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4,
            "position": [720, 300]
        },
        {
            "parameters": {
                "respondWith": "json",
                "responseBody": "={{ { analysis: $json.choices[0].message.content, model: $json.model, file_url: $('Webhook').item.json.body.fileUrl } }}",
                "options": {}
            },
            "id": "b1b2c3d4-0002-0002-0002-000000000004",
            "name": "Return Analysis",
            "type": "n8n-nodes-base.respondToWebhook",
            "typeVersion": 1,
            "position": [960, 300]
        }
    ],
    "connections": {
        "Webhook": {"main": [[{"node": "Fetch Document", "type": "main", "index": 0}]]},
        "Fetch Document": {"main": [[{"node": "Claude - Analyze Document", "type": "main", "index": 0}]]},
        "Claude - Analyze Document": {"main": [[{"node": "Return Analysis", "type": "main", "index": 0}]]}
    },
    "settings": {"executionOrder": "v1"},
}

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("Fetching workflow list...")
    workflows = list_workflows()
    for w in workflows:
        print(f"  [{w['id']}] {w['name']}")

    name_to_id = {w["name"]: w["id"] for w in workflows}

    # ── Workflow 1: Email Assistant ───────────────────────────────────────────
    wf1_name = "1 - Email Assistant"
    if wf1_name in name_to_id:
        wf1_id = name_to_id[wf1_name]
        print(f"\nFixing workflow 1 [{wf1_id}] ...")
        wf1 = get_workflow(wf1_id)
        for node in wf1["nodes"]:
            if node["name"] == "Claude - Summarize Email":
                fix_email_node(node)
                print("  Fixed: Claude - Summarize Email")
        result = put_workflow(wf1_id, wf1)
        print(f"  Done. updatedAt: {result.get('updatedAt', 'ok')}")
    else:
        print(f"\nWorkflow '{wf1_name}' not found in n8n — skipping.")

    # ── Workflow 2: Document Analyzer ─────────────────────────────────────────
    wf2_name = "2 - Document Analyzer"
    if wf2_name in name_to_id:
        wf2_id = name_to_id[wf2_name]
        print(f"\nFixing workflow 2 [{wf2_id}] ...")
        wf2 = get_workflow(wf2_id)
        for node in wf2["nodes"]:
            if node["name"] == "Claude - Analyze Document":
                fix_document_node(node)
                print("  Fixed: Claude - Analyze Document")
        result = put_workflow(wf2_id, wf2)
        print(f"  Done. updatedAt: {result.get('updatedAt', 'ok')}")
    else:
        print(f"\nWorkflow '{wf2_name}' not found — CREATING it ...")
        result = post_workflow(WF2_TEMPLATE)
        print(f"  Created ID: {result.get('id')} name: {result.get('name')}")

    # ── Workflow 3: Daily Briefing ─────────────────────────────────────────────
    wf3_name = "3 - Daily Briefing"
    if wf3_name in name_to_id:
        wf3_id = name_to_id[wf3_name]
        print(f"\nFixing workflow 3 [{wf3_id}] ...")
        wf3 = get_workflow(wf3_id)
        for node in wf3["nodes"]:
            if node["name"] == "Claude - Generate Briefing":
                fix_briefing_node(node)
                print("  Fixed: Claude - Generate Briefing")
        result = put_workflow(wf3_id, wf3)
        print(f"  Done. updatedAt: {result.get('updatedAt', 'ok')}")
    else:
        print(f"\nWorkflow '{wf3_name}' not found in n8n — skipping.")

    print("\nAll done!")

if __name__ == "__main__":
    main()
