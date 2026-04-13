#!/usr/bin/env python3
"""
Setup: 5 - Email Ingest workflow in n8n.

What this does:
  1. Creates a Google Drive OAuth2 credential in n8n
  2. Logs into Vikunja to get an API token
  3. Creates the Email Ingest workflow (6 nodes)

After running:
  → Go to n8n → Credentials → "Google Drive OAuth2" → click Connect
  → Activate the workflow "5 - Email Ingest"

How to get DRIVE_FOLDER_ID:
  Open the folder in Google Drive → the URL contains /folders/XXXXXXXXXX
  Copy that last part.

Usage:
  python3 setup_email_ingest.py
"""

import json
import urllib.request
import urllib.error
import sys

# ── CONFIG — fill in VIKUNJA_PASS and DRIVE_FOLDER_ID ─────────────────────────
N8N_URL       = "https://n8n-production-f1967.up.railway.app"
N8N_API_KEY   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NDU1NzRkZi05ZjViLTQ3NTgtYmI5Ny01NTJmOTQ2ZDlmMWIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDUyMjhhNWEtZTU5Ny00MjdhLWE1MTItYWRjOTBlNjI3ODI3IiwiaWF0IjoxNzc2MDQ0MzU5LCJleHAiOjE3Nzg1NTg0MDB9.hvvJEWeg4pbr_RyU2b-aiNRpvvVxCIVEelIVazves6s"

VIKUNJA_URL   = "https://vikunja-production-b34c.up.railway.app"
VIKUNJA_USER  = "admin"
VIKUNJA_PASS  = "FILL_ME_IN"   # ← paste your Vikunja password here
PROJECT_ID    = 1              # Inbox project

GOOGLE_CLIENT_ID     = "FILL_ME_IN"   # ← paste your Google OAuth2 Client ID
GOOGLE_CLIENT_SECRET = "FILL_ME_IN"   # ← paste your Google OAuth2 Client Secret
DRIVE_FOLDER_ID      = "FILL_ME_IN"  # ← Google Drive folder ID containing .eml files

API_KEY  = "qua-3fe84831eb5df3856a4790c2461ae1bf"
MODEL    = "claude-sonnet-4-6-20250929"
API_CHAT = "https://api.quatarly.cloud/v1/chat/completions"
# ──────────────────────────────────────────────────────────────────────────────

N8N_HEADERS = {
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json",
}


def n8n(method, path, body=None):
    url = f"{N8N_URL}/api/v1{path}"
    data = json.dumps(body).encode() if body else None
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


def build_workflow(cred_id, vikunja_token):
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
        "name": "5 - Email Ingest",
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
                        "id": cred_id,
                        "name": "Google Drive OAuth2",
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
                        "id": cred_id,
                        "name": "Google Drive OAuth2",
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
                    "sendHeaders": True,
                    "headerParameters": {
                        "parameters": [
                            {"name": "Authorization", "value": f"Bearer {API_KEY}"},
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
        "active": False,
    }


def main():
    # Check placeholders
    if VIKUNJA_PASS == "FILL_ME_IN":
        print("ERROR: Set VIKUNJA_PASS in the CONFIG section of this script.")
        sys.exit(1)
    if DRIVE_FOLDER_ID == "FILL_ME_IN":
        print("ERROR: Set DRIVE_FOLDER_ID in the CONFIG section of this script.")
        print("  Open your Google Drive folder → copy ID from URL: /folders/XXXXXXXXXX")
        sys.exit(1)

    # ── Step 1: Create Google Drive OAuth2 credential ─────────────────────────
    print("Step 1: Creating Google Drive OAuth2 credential in n8n...")
    cred_body = {
        "name": "Google Drive OAuth2",
        "type": "googleDriveOAuth2Api",
        "data": {
            "clientId":     GOOGLE_CLIENT_ID,
            "clientSecret": GOOGLE_CLIENT_SECRET,
        },
    }
    cred = n8n("POST", "/credentials", cred_body)
    cred_id = cred["id"]
    print(f"  Created credential ID: {cred_id}")

    # ── Step 2: Get Vikunja token ──────────────────────────────────────────────
    print("Step 2: Logging into Vikunja...")
    vikunja_token = vikunja_login(VIKUNJA_USER, VIKUNJA_PASS)
    print(f"  Got Vikunja token: {vikunja_token[:20]}...")

    # ── Step 3: Create workflow ────────────────────────────────────────────────
    print("Step 3: Creating workflow '5 - Email Ingest'...")
    wf = build_workflow(cred_id, vikunja_token)
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
