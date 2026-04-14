# Work Assistant API

Serwerowa warstwa wiedzy dla asystenta pracy.

Ten serwis jest systemem-of-record dla:

- dokumentow i maili po analizie,
- chunkow i embeddingow,
- analizy Claude w JSON,
- mirrora taskow z Vikunja,
- retrievalu pod chat i future actions.

## Why this service exists

`n8n` zostaje warstwa triggerow i automatyzacji.
`LibreChat` zostaje UI na start.
`Vikunja` zostaje systemem taskow.

To API spina te elementy i daje jedno miejsce, z ktorego AI ma korzystac przy odpowiedziach i akcjach.

## Initial scope

- `GET /healthz`
- `POST /v1/documents/ingest`
- `POST /v1/enrichment/web`
- `POST /v1/search`
- `POST /v1/assistant/query`
- `POST /v1/tasks/sync`
- `POST /v1/tasks/query`
- `GET /v1/tasks/schedule`
- `POST /v1/tasks/{task_id}/complete`
- `POST /v1/meetings/intake`
- `GET /v1/meetings/query`
- `POST /v1/meetings/{document_id}/rebuild-tasks`
- `POST /v1/meetings/sync-pending`
- `POST /v1/meetings/tasks/{external_task_id}/complete`

## Search modes

`POST /v1/search` dziala od razu jako full-text.

Jesli ustawisz:

- `EMBEDDING_API_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`

to endpoint przechodzi w tryb hybrid search:

- full-text
- semantic vector search po `pgvector`

## Assistant query

`POST /v1/assistant/query`:

- odpytuje knowledge base,
- zbiera taski i dokumenty,
- buduje kontekst z cytowaniami,
- dopiero wtedy generuje odpowiedz przez Claude-compatible chat API.

Przyklad:

```bash
curl -X POST http://localhost:8080/v1/assistant/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "query": "Co mam do zrobienia do piatku w sprawie umowy ABC?",
    "search_limit": 8,
    "include_tasks": true
  }'
```

## Web enrichment

Kolejkowanie internetowego researchu dla tematow wykrytych w mailach i dokumentach:

```bash
curl -X POST http://localhost:8080/v1/enrichment/web \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "topics": [
      {"name": "Market Coupling", "confidence": 0.92},
      {"name": "Network Codes", "confidence": 0.88}
    ],
    "queries": [
      "latest Market Coupling regulatory updates Europe",
      "Network Codes implementation updates Poland ENTSO-E"
    ],
    "allow_domains": ["entsoe.eu", "acer.europa.eu", "ure.gov.pl"],
    "freshness_days": 180,
    "max_results": 10
  }'
```

## Task sync and actions

Sync taskow z Vikunja do local mirror:

```bash
curl -X POST http://localhost:8080/v1/tasks/sync \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "project_ids": [1]
  }'
```

Filtrowanie taskow po statusie / terminie:

```bash
curl -X POST http://localhost:8080/v1/tasks/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "statuses": ["open"],
    "due_before": "2026-04-18T23:59:59+02:00",
    "project_ids": ["1"]
  }'
```

Oznaczenie taska jako zrobionego:

```bash
curl -X POST http://localhost:8080/v1/tasks/123/complete \
  -H "X-API-Key: YOUR_KEY"
```

Feed harmonogramu (wspolny dla `tasks/schedule/cerebro`):

```bash
curl "http://localhost:8080/v1/tasks/schedule?horizon_days=7&limit=200" \
  -H "X-API-Key: YOUR_KEY"
```

## Meetings pipeline

Ingest analizy spotkania webhookiem:

```bash
curl -X POST http://localhost:8080/v1/meetings/intake \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "source_type": "manual_upload",
    "external_id": "meeting-2026-04-13-standup",
    "title": "Daily Standup",
    "meeting_date": "2026-04-13",
    "project": "Praca",
    "transcript": "Ustalenia i action itemy...",
    "auto_sync_tasks": true
  }'
```

Pobranie backlogu spotkan:

```bash
curl "http://localhost:8080/v1/meetings/query?limit=25&sync_status=pending" \
  -H "X-API-Key: YOUR_KEY"
```

Rebuild i dosync taskow dla spotkania:

```bash
curl -X POST http://localhost:8080/v1/meetings/{document_id}/rebuild-tasks \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"project_id": 1}'
```

Masowy sync spotkan ze statusem pending/partial:

```bash
curl -X POST http://localhost:8080/v1/meetings/sync-pending \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"limit": 50, "date_from": "2026-04-01", "date_to": "2026-04-30"}'
```

Smoke-test end-to-end po deployu:

```bash
WORK_ASSISTANT_API_URL=https://work-assistant-api-production.up.railway.app \
WORK_ASSISTANT_API_KEY=YOUR_KEY \
python3 scripts/meeting_pipeline_smoke.py
```

## Authentication

Poza `GET /healthz` endpointy wymagaja klucza w naglowku:

- `X-API-Key: ...`

Klucz ustawiasz przez `APP_API_KEY`.

## Deployment model

- osobny serwis na Railway
- osobny `PostgreSQL + pgvector`
- pozniej:
  - worker backfillu,
  - object storage,
  - integracja Claude/embeddings,
  - integracja z n8n i chat UI

## Local run

```bash
cp .env.example .env
pip install -e .
uvicorn app.main:app --reload --port 8080
```

## Database bootstrap

W bazie docelowej wykonaj:

```sql
\i sql/001_init.sql
```

albo wklej zawartosc pliku `sql/001_init.sql`.

## Notes

- schema ma od razu revision model dla dokumentow,
- ingest endpoint przyjmuje juz dane po extraction/analysis,
- embeddings sa przygotowane w modelu danych, ale ich generacja bedzie dodana w kolejnym kroku.
