# Railway Bootstrap

## Objective

Postawic pierwsze dwa docelowe serwisy:

- `postgres-pgvector`
- `work-assistant-api`
- `work-assistant-worker`

To jest poczatek docelowej architektury. Dopiero po tym podpniemy ingest maili, Claude analysis i chat tools.

## Service 1: PostgreSQL

W Railway:

1. `+ New` -> `Database` -> `Postgres`
2. Nazwij serwis np. `work-assistant-db`
3. Po provisioningu zapisz:
   - `DATABASE_URL`
   - `PGHOST`
   - `PGPORT`
   - `PGDATABASE`
   - `PGUSER`
   - `PGPASSWORD`

## Enable pgvector

Po polaczeniu do bazy wykonaj:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
```

Potem wykonaj caly plik:

`services/work-assistant-api/sql/001_init.sql`

Nastepnie wykonaj:

`services/work-assistant-api/sql/002_enrichment.sql`

Alternatywnie, po deployu API mozesz uruchomic:

```bash
python migrate.py
```

w kontenerze `work-assistant-api`, jesli `DATABASE_URL` jest ustawione.

## Service 2: Work Assistant API

W Railway:

1. `+ New` -> `GitHub Repo`
2. Wskaz to repo
3. Ustaw `Root Directory` na:

```text
services/work-assistant-api
```

4. Railway powinien wykryc `Dockerfile`
5. W `Settings -> Networking` ustaw public domain
6. Opcjonalnie ustaw `Pre-deploy command`:

```text
python migrate.py
```

## Variables for work-assistant-api

W `Variables -> Raw Editor` wklej minimum:

```text
APP_ENV=production
APP_LOG_LEVEL=INFO
APP_PORT=8080
APP_API_KEY=FILL_ME
DATABASE_URL=${{work-assistant-db.DATABASE_URL}}
DATABASE_MIN_POOL_SIZE=1
DATABASE_MAX_POOL_SIZE=10
VECTOR_DIMENSIONS=1536
VIKUNJA_URL=https://vikunja-production-b34c.up.railway.app
VIKUNJA_API_TOKEN=FILL_ME
ANTHROPIC_API_KEY=FILL_ME
ANTHROPIC_MODEL=FILL_ME
LLM_API_URL=https://api.quatarly.cloud/v0/chat/completions
LLM_API_KEY=FILL_ME
LLM_MODEL=claude-sonnet-4-6-20250929
EMBEDDING_API_URL=FILL_ME
EMBEDDING_API_KEY=FILL_ME
EMBEDDING_PROVIDER=FILL_ME
EMBEDDING_MODEL=FILL_ME
```

## Service 3: Work Assistant Worker

W Railway:

1. `+ New` -> `GitHub Repo`
2. Wskaz to samo repo
3. Nie ustawiaj `Root Directory`
4. W `Build Configuration` ustaw `Dockerfile Path` na:

```text
services/work-assistant-worker/Dockerfile
```

5. Nie generuj public domain, to ma byc prywatny worker

Variables:

```text
DATABASE_URL=${{work-assistant-db.DATABASE_URL}}
WORK_ASSISTANT_API_URL=https://YOUR-WORK-ASSISTANT-API.up.railway.app
WORK_ASSISTANT_API_KEY=FILL_ME
LLM_API_URL=https://api.quatarly.cloud/v0/chat/completions
LLM_API_KEY=FILL_ME
LLM_MODEL=claude-sonnet-4-6-20250929
SEARCH_PROVIDER=tavily
SEARCH_API_URL=https://api.tavily.com/search
SEARCH_API_KEY=FILL_ME
EMBEDDING_API_URL=FILL_ME
EMBEDDING_API_KEY=FILL_ME
EMBEDDING_MODEL=FILL_ME
ENRICHMENT_BATCH_SIZE=5
ENRICHMENT_POLL_INTERVAL_SECONDS=120
```

## Smoke test

Po deploymencie sprawdz:

- `GET /healthz`

Przykladowo:

```bash
curl https://YOUR-WORK-ASSISTANT-API.up.railway.app/healthz
```

Oczekiwany wynik:

```json
{
  "status": "ok",
  "database": "ok",
  "environment": "production"
}
```

## What comes next

Po udanym bootstrapie:

1. dodajemy worker backfillu historycznych maili,
2. dodajemy worker ingestu dokumentow `pdf/docx/xlsx/pptx`,
3. przepinamy n8n ingest do `POST /v1/documents/ingest`,
4. dopinamy embeddings i search retrieval,
5. wystawiamy tools dla chat UI.
