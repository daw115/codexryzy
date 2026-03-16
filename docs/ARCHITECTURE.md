# Architecture

## Data flow

1. Frontend browser recorder captures screen/window + audio via MediaRecorder.
2. File + metadata is posted to backend.
3. Backend stores metadata and uploads recording to Drive (stubbed extension point).
4. Worker monitors Drive and processes new recordings.
5. Artifacts are written back to Drive and indexed in PostgreSQL/pgvector.
6. Chat endpoint performs retrieval + generation over indexed chunks.

## Components

- Frontend: recorder, meeting list, chat panel.
- Backend: REST API, SQL models, RAG endpoint.
- Worker: pipeline orchestration + outputs.
- PostgreSQL+pgvector: metadata + vectors.
