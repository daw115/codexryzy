#!/usr/bin/env python3
"""
Setup: 5 - Email Ingest workflow in n8n.

What this does:
  1. Reuses or creates a Google Drive OAuth2 credential in n8n
  2. Reuses the existing Quatarly n8n credential
  3. Uses a Vikunja API token or logs in to obtain one
  4. Creates the Email Ingest workflow (6 nodes)

After running:
  → Go to n8n → Credentials → "Google Drive OAuth2" → click Connect
  → Activate the workflow "5 - Email Ingest"

How to get DRIVE_FOLDER_ID:
  Open the folder in Google Drive → the URL contains /folders/XXXXXXXXXX
  Copy that last part.

Usage:
  export N8N_API_KEY=...
  export GOOGLE_CLIENT_ID=...
  export GOOGLE_CLIENT_SECRET=...
  export DRIVE_FOLDER_ID=...
  export VIKUNJA_API_TOKEN=...   # or VIKUNJA_PASS=...
  python3 setup_email_ingest.py
"""

import json
import os
import urllib.request
import urllib.error
import sys

# ── CONFIG — set via environment variables ────────────────────────────────────
N8N_URL       = os.environ.get("N8N_URL", "https://n8n-production-f1967.up.railway.app").rstrip("/")
N8N_API_KEY   = os.environ.get("N8N_API_KEY", "")

VIKUNJA_URL        = os.environ.get("VIKUNJA_URL", "https://vikunja-production-b34c.up.railway.app").rstrip("/")
VIKUNJA_USER       = os.environ.get("VIKUNJA_USER", "admin")
VIKUNJA_PASS       = os.environ.get("VIKUNJA_PASS", "")
VIKUNJA_API_TOKEN  = os.environ.get("VIKUNJA_API_TOKEN", "")
PROJECT_ID         = int(os.environ.get("VIKUNJA_PROJECT_ID", "1"))

GOOGLE_CLIENT_ID      = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET  = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_DRIVE_CRED_NAME = os.environ.get("N8N_GOOGLE_DRIVE_CREDENTIAL_NAME", "Google Drive OAuth2")
DRIVE_FOLDER_ID       = os.environ.get("DRIVE_FOLDER_ID", "")

QUATARLY_CRED_NAME = os.environ.get("N8N_QUATARLY_CREDENTIAL_NAME", "Quatarly API Key")
MODEL              = os.environ.get("QUATARLY_MODEL", "claude-sonnet-4-6-20250929")
API_CHAT           = os.environ.get("QUATARLY_API_CHAT", "https://api.quatarly.cloud/v0/chat/completions")
WORKFLOW_NAME      = os.environ.get("N8N_EMAIL_INGEST_WORKFLOW_NAME", "5 - Email Ingest")
# ──────────────────────────────────────────────────────────────────────────────

N8N_HEADERS = {
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json",
}


def n8n(method, path, body=None):
    url = f"{N8N_URL}/api/v1{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=N8N_HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()}")
        raise


def vikunja_login(username, password):
    url = f"{VIKUNJA_URL}/api/v1/user/login"
    data = json.dumps({"username": username, "password": password}).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())["token"]
    except urllib.error.HTTPError as e:
        print(f"  Vikunja login failed HTTP {e.code}: {e.read().decode()}")
        raise


def find_n8n_credential(name, cred_type=None):
    result = n8n("GET", "/credentials")
    for cred in result.get("data", []):
        if cred["name"] != name:
            continue
        if cred_type and cred["type"] != cred_type:
            continue
        return cred
    return None


def find_n8n_workflow(name):
    result = n8n("GET", "/workflows")
    for workflow in result.get("data", []):
        if workflow["name"] == name:
            return workflow
    return None


# ── Code node scripts ──────────────────────────────────────────────────────────

PARSE_EMAIL_JS = r"""
// Decode binary .eml and parse headers + body
const item = $input.first();

// Get binary data (from Google Drive download)
const binaryKeys = Object.keys(item.binary || {});
if (binaryKeys.length === 0) {
  return [{ json: { subject: '(no content)', from: '', body: '', date: new Date().toISOString(), fileName: 'unknown.eml' } }];
}

const binaryKey = binaryKeys[0];
const rawContent = Buffer.from(item.binary[binaryKey].data, 'base64').toString('utf-8');

// Parse EML: split on first blank line = headers | body
const crlf = rawContent.includes('\r\n');
const sep = crlf ? '\r\n' : '\n';
const blankLine = crlf ? '\r\n\r\n' : '\n\n';
const blankIdx = rawContent.indexOf(blankLine);

const headerSection = blankIdx >= 0 ? rawContent.substring(0, blankIdx) : rawContent;
let body = blankIdx >= 0 ? rawContent.substring(blankIdx + blankLine.length) : '';

// Parse headers (with folding support)
const headers = {};
let currentKey = '';
for (const line of headerSection.split(sep)) {
  if (line.startsWith(' ') || line.startsWith('\t')) {
    if (currentKey) headers[currentKey] += ' ' + line.trim();
  } else {
    const idx = line.indexOf(':');
    if (idx > 0) {
      currentKey = line.substring(0, idx).toLowerCase().trim();
      headers[currentKey] = line.substring(idx + 1).trim();
    }
  }
}

// Clean up body: remove quoted-printable soft line breaks, limit length
body = body.replace(/=\r?\n/g, '').replace(/\r/g, '').trim();
if (body.length > 6000) body = body.substring(0, 6000) + '\n...[truncated]';

return [{
  json: {
    subject:  headers['subject']  || '(no subject)',
    from:     headers['from']     || '',
    to:       headers['to']       || '',
    date:     headers['date']     || new Date().toISOString(),
    body:     body,
    fileName: item.binary[binaryKey].fileName || 'email.eml',
  }
}];
"""

EXTRACT_TASK_JS = r"""
// Parse Claude's JSON response into a Vikunja task payload
const claudeItem = $input.first();
const emailItem  = $('Code - Parse Email').first();

const content = claudeItem.json?.choices?.[0]?.message?.content || '';

let task = {};
try {
  const match = content.match(/\{[\s\S]*\}/);
  if (match) task = JSON.parse(match[0]);
} catch (e) {
  task = { title: 'Email: ' + emailItem.json.subject, description: content, priority: 'medium' };
}

// Map text priority → Vikunja numeric (0=unset,1=low,2=medium,3=high,4=urgent,5=now)
const priMap = { low: 1, medium: 2, high: 3, urgent: 4, critical: 4, now: 5 };
let priority = typeof task.priority === 'string'
  ? (priMap[task.priority.toLowerCase()] ?? 2)
  : (typeof task.priority === 'number' ? task.priority : 2);

// Format due date
let dueDate = null;
if (task.due_date) {
  try { dueDate = new Date(task.due_date).toISOString(); } catch (e) {}
}

const email = emailItem.json;
const description = [
  `**From:** ${email.from}`,
  `**Date:** ${email.date}`,
  `**Category:** ${task.category || 'General'}`,
  '',
  `**Summary:** ${task.summary || ''}`,
  '',
  task.description || '',
].join('\n').trim();

return [{
  json: {
    title:       (task.title || 'Email: ' + email.subject).substring(0, 100),
    description: description,
    due_date:    dueDate,
    priority:    priority,
  }
}];
"""


def build_workflow(google_drive_cred, quatarly_cred, vikunja_token):
    """Build the full Email Ingest workflow JSON."""

    claude_body = (
        "={{ JSON.stringify({"
        "model: '" + MODEL + "', "
        "max_tokens: 1024, "
        "messages: ["
        "{role: 'system', content: 'You are an email task extractor. "
        "Analyze the email and return ONLY valid JSON (no markdown) with: "
        "{\"title\": string (max 80 chars, action-oriented), "
        "\"summary\": string (2-3 sentences), "
        "\"description\": string (details), "
        "\"due_date\": string|null (ISO 8601, extract from email text), "
        "\"priority\": \"low\"|\"medium\"|\"high\"|\"urgent\", "
        "\"category\": string (infer from context), "
        "\"action_required\": boolean}'}, "
        "{role: 'user', content: 'Extract tasks from this email:\\n\\n"
        "From: ' + $json.from + '\\nSubject: ' + $json.subject + "
        "'\\nDate: ' + $json.date + '\\n\\n' + $json.body}"
        "], "
        "stream: false"
        "}) }}"
    )

    vikunja_body = (
        "={{ JSON.stringify({"
        "title: $json.title, "
        "description: $json.description, "
        "due_date: $json.due_date, "
        "priority: $json.priority"
        "}) }}"
    )

    return {
        "name": WORKFLOW_NAME,
        "nodes": [
            # Node 1: Google Drive Trigger
            {
                "parameters": {
                    "triggerOn": "fileCreatedInFolder",
                    "folderToWatch": {
                        "__rl": True,
                        "value": DRIVE_FOLDER_ID,
                        "mode": "id",
                    },
                    "options": {},
                },
                "id": "c5d6e7f8-0005-0005-0005-000000000001",
                "name": "Google Drive Trigger",
                "type": "n8n-nodes-base.googleDriveTrigger",
                "typeVersion": 3,
                "position": [240, 300],
                "credentials": {
                    "googleDriveOAuth2Api": {
                        "id": google_drive_cred["id"],
                        "name": google_drive_cred["name"],
                    }
                },
            },
            # Node 2: Google Drive Download
            {
                "parameters": {
                    "operation": "download",
                    "fileId": {
                        "__rl": True,
                        "value": "={{ $json.id }}",
                        "mode": "id",
                    },
                    "options": {},
                },
                "id": "c5d6e7f8-0005-0005-0005-000000000002",
                "name": "Google Drive - Download",
                "type": "n8n-nodes-base.googleDrive",
                "typeVersion": 3,
                "position": [520, 300],
                "credentials": {
                    "googleDriveOAuth2Api": {
                        "id": google_drive_cred["id"],
                        "name": google_drive_cred["name"],
                    }
                },
            },
            # Node 3: Code - Parse Email
            {
                "parameters": {
                    "jsCode": PARSE_EMAIL_JS,
                },
                "id": "c5d6e7f8-0005-0005-0005-000000000003",
                "name": "Code - Parse Email",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [800, 300],
            },
            # Node 4: HTTP Request - Claude
            {
                "parameters": {
                    "method": "POST",
                    "url": API_CHAT,
                    "authentication": "genericCredentialType",
                    "genericAuthType": "httpHeaderAuth",
                    "sendHeaders": True,
                    "headerParameters": {
                        "parameters": [
                            {"name": "Content-Type",  "value": "application/json"},
                        ]
                    },
                    "sendBody": True,
                    "specifyBody": "json",
                    "jsonBody": claude_body,
                    "options": {},
                },
                "id": "c5d6e7f8-0005-0005-0005-000000000004",
                "name": "Claude - Extract Tasks",
                "type": "n8n-nodes-base.httpRequest",
                "typeVersion": 4,
                "position": [1080, 300],
                "credentials": {
                    "httpHeaderAuth": {
                        "id": quatarly_cred["id"],
                        "name": quatarly_cred["name"],
                    }
                },
            },
            # Node 5: Code - Extract Task
            {
                "parameters": {
                    "jsCode": EXTRACT_TASK_JS,
                },
                "id": "c5d6e7f8-0005-0005-0005-000000000005",
                "name": "Code - Extract Task",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [1360, 300],
            },
            # Node 6: HTTP Request - Vikunja
            {
                "parameters": {
                    "method": "POST",
                    "url": f"{VIKUNJA_URL}/api/v1/projects/{PROJECT_ID}/tasks",
                    "sendHeaders": True,
                    "headerParameters": {
                        "parameters": [
                            {"name": "Authorization", "value": f"Bearer {vikunja_token}"},
                            {"name": "Content-Type",  "value": "application/json"},
                        ]
                    },
                    "sendBody": True,
                    "specifyBody": "json",
                    "jsonBody": vikunja_body,
                    "options": {},
                },
                "id": "c5d6e7f8-0005-0005-0005-000000000006",
                "name": "Vikunja - Create Task",
                "type": "n8n-nodes-base.httpRequest",
                "typeVersion": 4,
                "position": [1640, 300],
            },
        ],
        "connections": {
            "Google Drive Trigger": {
                "main": [[{"node": "Google Drive - Download", "type": "main", "index": 0}]]
            },
            "Google Drive - Download": {
                "main": [[{"node": "Code - Parse Email", "type": "main", "index": 0}]]
            },
            "Code - Parse Email": {
                "main": [[{"node": "Claude - Extract Tasks", "type": "main", "index": 0}]]
            },
            "Claude - Extract Tasks": {
                "main": [[{"node": "Code - Extract Task", "type": "main", "index": 0}]]
            },
            "Code - Extract Task": {
                "main": [[{"node": "Vikunja - Create Task", "type": "main", "index": 0}]]
            },
        },
        "settings": {"executionOrder": "v1"},
    }


def main():
    if not N8N_API_KEY:
        print("ERROR: Set N8N_API_KEY in the environment.")
        sys.exit(1)
    if not DRIVE_FOLDER_ID:
        print("ERROR: Set DRIVE_FOLDER_ID in the environment.")
        print("  Open your Google Drive folder → copy ID from URL: /folders/XXXXXXXXXX")
        sys.exit(1)
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        print("ERROR: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment.")
        sys.exit(1)
    if not VIKUNJA_API_TOKEN and not VIKUNJA_PASS:
        print("ERROR: Set VIKUNJA_API_TOKEN or VIKUNJA_PASS in the environment.")
        sys.exit(1)

    quatarly_cred = find_n8n_credential(QUATARLY_CRED_NAME, "httpHeaderAuth")
    if not quatarly_cred:
        print(f"ERROR: Missing n8n credential '{QUATARLY_CRED_NAME}'.")
        print("  Create an HTTP Header Auth credential in n8n with the Quatarly bearer token first.")
        sys.exit(1)

    existing_google_drive_cred = find_n8n_credential(GOOGLE_DRIVE_CRED_NAME, "googleDriveOAuth2Api")
    if existing_google_drive_cred:
        google_drive_cred = existing_google_drive_cred
        print(f"Step 1: Reusing Google Drive credential '{google_drive_cred['name']}' ({google_drive_cred['id']})...")
    else:
        print("Step 1: Creating Google Drive OAuth2 credential in n8n...")
        cred_body = {
            "name": GOOGLE_DRIVE_CRED_NAME,
            "type": "googleDriveOAuth2Api",
            "data": {
                "serverUrl": "https://accounts.google.com",
                "clientId":     GOOGLE_CLIENT_ID,
                "clientSecret": GOOGLE_CLIENT_SECRET,
                "sendAdditionalBodyProperties": False,
                "additionalBodyProperties": {},
            },
        }
        google_drive_cred = n8n("POST", "/credentials", cred_body)
        print(f"  Created credential ID: {google_drive_cred['id']}")

    # ── Step 2: Get Vikunja token ──────────────────────────────────────────────
    print("Step 2: Resolving Vikunja auth...")
    if VIKUNJA_API_TOKEN:
        vikunja_token = VIKUNJA_API_TOKEN
        print("  Using VIKUNJA_API_TOKEN from the environment.")
    else:
        vikunja_token = vikunja_login(VIKUNJA_USER, VIKUNJA_PASS)
        print(f"  Logged in as {VIKUNJA_USER}.")

    # ── Step 3: Create workflow ────────────────────────────────────────────────
    existing_workflow = find_n8n_workflow(WORKFLOW_NAME)
    if existing_workflow:
        print(f"ERROR: Workflow '{WORKFLOW_NAME}' already exists with ID {existing_workflow['id']}.")
        print("  Delete or rename it before running this script again.")
        sys.exit(1)

    print(f"Step 3: Creating workflow '{WORKFLOW_NAME}'...")
    wf = build_workflow(google_drive_cred, quatarly_cred, vikunja_token)
    result = n8n("POST", "/workflows", wf)
    wf_id = result["id"]
    print(f"  Created workflow ID: {wf_id}")

    # ── Done ───────────────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("DONE! Next steps:")
    print()
    print("1. Go to n8n:")
    print(f"   {N8N_URL}")
    print()
    print("2. Credentials → 'Google Drive OAuth2' → click Connect")
    print("   (this authorizes access to your Google Drive)")
    print()
    print("3. Open workflow '5 - Email Ingest'")
    print("   → check the Google Drive Trigger folder ID is correct")
    print("   → toggle Active ON")
    print()
    print("That's it — new .eml files dropped in your Drive folder")
    print("will automatically become tasks in Vikunja Inbox.")
    print("=" * 60)


if __name__ == "__main__":
    main()
