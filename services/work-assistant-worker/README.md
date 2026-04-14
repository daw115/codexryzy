# Work Assistant Worker

Dedicated Railway worker service for queued web enrichment jobs.

## Runtime

The service runs:

```bash
python scripts/web_enrichment_worker.py
```

Set:

- `ENRICHMENT_POLL_INTERVAL_SECONDS=120`

to make it poll the queue continuously.

## Required variables

- `DATABASE_URL`
- `WORK_ASSISTANT_API_URL`
- `WORK_ASSISTANT_API_KEY`
- `LLM_API_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `SEARCH_API_URL`
- `SEARCH_API_KEY`

Optional:

- `EMBEDDING_API_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`
- `SEARCH_PROVIDER`
- `ENRICHMENT_BATCH_SIZE`
- `ENRICHMENT_POLL_INTERVAL_SECONDS`
