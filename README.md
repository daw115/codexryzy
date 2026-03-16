# AI Meeting Brain

AI Meeting Brain is a private, self-hostable meeting intelligence platform that records meetings in-browser, uploads recordings to Google Drive, transcribes and analyzes them with AI, and builds a searchable knowledge base with RAG chat.

## ✨ What this project does

- **Browser-native recording** in Chrome/Edge using MediaRecorder + screen/window capture.
- **Google Drive-first storage** for recordings and metadata.
- **Automated processing worker** that detects new recordings and runs:
  1. audio extraction
  2. Whisper transcription
  3. GPT analysis
  4. vector indexing
- **Knowledge base + semantic search** using PostgreSQL + pgvector.
- **Ask Your Meetings chat** (RAG) over transcripts and meeting outputs.
- **Dashboard UI** for meetings, summaries, tasks, search, transcript views, and chat.
- **Auto-reports** in Markdown/JSON/PDF.

## 🏗️ Repository structure

```text
/frontend      React + Vite + Tailwind dashboard and recorder UI
/backend       FastAPI API for meetings, ingestion, search, and chat
/worker        Background worker for Drive monitoring + processing pipeline
/vector-db     SQL bootstrap for pgvector schema
/docker        Container and infrastructure helper files
/scripts       Utility scripts for setup and local workflows
/docs          Architecture and operations docs
/docker-compose.yml
```

## 🧰 Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend API:** FastAPI, SQLAlchemy, Pydantic, OpenAI API client
- **Worker:** Python pipeline service with ffmpeg + Whisper
- **Storage:** Google Drive API
- **Database:** PostgreSQL + pgvector extension
- **Embeddings / LLM:** OpenAI (`text-embedding-3-small`, `gpt-4o-mini` by default)
- **PDF:** ReportLab (or markdown-to-pdf alternative)

## 🔐 Security model

- Meeting recordings are stored in the user-owned **Google Drive**.
- Database is local/private in Docker network.
- External calls are limited to:
  - Google Drive API
  - OpenAI API
- No cloud-hosted DB is required.

## ✅ Prerequisites

- Docker + Docker Compose
- Google Cloud project with Drive API enabled
- OpenAI API key

## 🚀 Quick start

1. **Clone and configure env**

   ```bash
   cp .env.example .env
   ```

2. **Fill `.env` values**

   - `OPENAI_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `GOOGLE_DRIVE_ROOT_FOLDER_ID`

3. **Start stack**

   ```bash
   docker compose up --build
   ```

4. **Open app**

   - Dashboard: http://localhost:5173
   - API docs: http://localhost:8000/docs

## ⚙️ Configuration reference

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key for analysis + embeddings |
| `OPENAI_CHAT_MODEL` | Chat model (default: `gpt-4o-mini`) |
| `OPENAI_EMBED_MODEL` | Embeddings model (default: `text-embedding-3-small`) |
| `DATABASE_URL` | SQLAlchemy DB URL |
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_REFRESH_TOKEN` | OAuth refresh token |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Parent folder where `/Meetings` is created |
| `WORKER_POLL_INTERVAL_SEC` | Worker polling cadence |
| `WHISPER_MODEL` | Whisper model name |

## 🔑 Google Drive integration guide

1. Create Google Cloud project.
2. Enable **Google Drive API**.
3. Configure OAuth consent + Desktop app credentials.
4. Generate refresh token (using OAuth playground or script).
5. Put credentials into `.env`.
6. Ensure your selected root folder has write access.

### Drive folder layout

Worker and backend enforce:

```text
/Meetings
/YYYY-MM-DD
meeting_recording.webm
metadata.json
transcript.json
meeting_summary.md
action_items.json
decisions.json
topics.json
report.pdf
```

## 🧠 Processing pipeline details

```text
recording.webm
  -> ffmpeg extracts audio (wav)
  -> Whisper transcribes to transcript.json
  -> GPT creates summary/tasks/decisions/topics
  -> chunks + embeddings indexed to pgvector
  -> report.md + report.pdf generated
```

## 💬 Ask Your Meetings (RAG)

1. User enters question in dashboard chat.
2. Backend embeds question.
3. pgvector similarity search retrieves most relevant chunks.
4. GPT generates grounded answer with meeting context.

Example questions:
- “What decisions were made about transformer parameters?”
- “Summarize all meetings from last week.”
- “List tasks assigned to Dawid.”

## 🖥️ Browser recorder behavior

- Uses `navigator.mediaDevices.getDisplayMedia`.
- Supports screen/window selection via browser picker.
- Attempts system audio capture where browser/OS allows.
- Shows recording timer.
- Exports WebM and uploads to backend -> Google Drive.
- Saves metadata: title, date, duration.

> Region selection is constrained by browser security model. This implementation supports built-in display surface selection and optional post-crop workflow in processing.

## 🧪 Local development without Docker

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Worker

```bash
cd worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## 🏠 Home server deployment notes

- Keep `.env` in a secret manager or local secure path.
- Run behind reverse proxy (Caddy/Nginx) with HTTPS.
- Restrict frontend/backend exposure to LAN or VPN.
- Back up PostgreSQL volume.
- Consider rotating API keys periodically.

## 📈 Bonus features status

- ✅ Topic detection (implemented in AI analysis output)
- ⚠️ Speaker detection (placeholder “unknown”; pluggable diarization)
- ✅ Meeting timeline (timeline derivable from transcript timestamps)
- ✅ Highlights extraction (included in summary prompt)
- ⚠️ Automatic email summary (stub endpoint + TODO integration)

## 📌 Notes

This repository provides a production-minded scaffold with core workflows and clear extension points. Some integrations (OAuth token generation, diarization, email sender provider) need environment-specific setup.
