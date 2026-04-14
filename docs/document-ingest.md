# Document Ingest

## Purpose

Import lokalnych dokumentow do `work-assistant-api`:

- PDF
- DOCX
- XLSX
- PPTX
- TXT / MD / CSV

Pipeline robi:

1. ekstrakcje tekstu i podstawowych metadanych,
2. analize dokumentu przez Claude-compatible API,
3. chunking i opcjonalne embeddingi,
4. zapis do `work-assistant-api`,
5. opcjonalne kolejkowanie web enrichment dla glownych tematow.

## Install dependencies

Na `Python 3.12`:

```bash
/opt/homebrew/bin/python3.12 -m venv .venv-312
source .venv-312/bin/activate
pip install -r scripts/requirements-ingest.txt
```

## Required environment variables

```text
WORK_ASSISTANT_API_URL=https://YOUR-WORK-ASSISTANT-API.up.railway.app
WORK_ASSISTANT_API_KEY=FILL_ME
LLM_API_URL=https://api.quatarly.cloud/v0/chat/completions
LLM_API_KEY=FILL_ME
LLM_MODEL=claude-sonnet-4-6-20250929
```

Optional:

```text
EMBEDDING_API_URL=FILL_ME
EMBEDDING_API_KEY=FILL_ME
EMBEDDING_MODEL=FILL_ME
AUTO_QUEUE_ENRICHMENT=true
ENRICH_ALLOW_DOMAINS=entsoe.eu,acer.europa.eu,ure.gov.pl
ENRICH_FRESHNESS_DAYS=180
ENRICH_MAX_RESULTS=10
ENRICH_MAX_TOPICS=3
```

## Run

Pojedynczy plik:

```bash
python scripts/ingest_documents_to_work_assistant.py /path/to/file.pdf
```

Caly katalog rekurencyjnie:

```bash
python scripts/ingest_documents_to_work_assistant.py /path/to/folder
```

## Notes

- `external_id` jest oparte o absolutna sciezke lokalna,
- deduplikacja rewizji i tak opiera sie o `checksum`,
- przy migracji do uploadow serwerowych ten sam extractor moze byc uzyty po stronie workerow.
