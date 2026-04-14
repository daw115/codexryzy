# Web Enrichment Worker

## Purpose

Worker bierze `pending` joby z tabeli `enrichment_jobs`, wykonuje kontrolowany search internetowy i zapisuje wyniki jako dokumenty `web_research` w knowledge base.

## What it does

1. pobiera joby z bazy,
2. odpytuje provider search API,
3. filtruje wyniki po allowliscie domen,
4. pobiera tresc stron,
5. analizuje je przez Claude-compatible API,
6. zapisuje jako zwykle dokumenty przez `work-assistant-api`,
7. podpina wynik do topicu i zamyka job.

## Required environment variables

```text
DATABASE_URL=postgresql://...
WORK_ASSISTANT_API_URL=https://YOUR-WORK-ASSISTANT-API.up.railway.app
WORK_ASSISTANT_API_KEY=FILL_ME
LLM_API_URL=https://api.quatarly.cloud/v0/chat/completions
LLM_API_KEY=FILL_ME
LLM_MODEL=claude-sonnet-4-6-20250929
SEARCH_PROVIDER=tavily
SEARCH_API_URL=https://api.tavily.com/search
SEARCH_API_KEY=FILL_ME
```

Optional:

```text
EMBEDDING_API_URL=FILL_ME
EMBEDDING_API_KEY=FILL_ME
EMBEDDING_MODEL=FILL_ME
ENRICHMENT_BATCH_SIZE=5
```

## Run

Najpierw:

```bash
source .venv-312/bin/activate
pip install -r scripts/requirements-worker.txt
```

Potem:

```bash
python scripts/web_enrichment_worker.py
```

## Notes

- worker nie robi otwartego internetu bez kontroli; korzysta z `allow_domains` zapisanych na jobie,
- wyniki zapisuje jako `source_type=web_research`,
- do poprawnego dzialania potrzebujesz juz wykonanych migracji `001_init.sql` i `002_enrichment.sql`.
