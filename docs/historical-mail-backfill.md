# Historical Mail Backfill

## Purpose

Jednorazowy import historycznego archiwum `.msg` z publicznego folderu Google Drive do `work-assistant-api`.

Pipeline robi:

1. listowanie plikow z folderu Drive,
2. pobranie i ekstrakcje tekstu z `.msg`,
3. analize kazdego maila przez Claude-compatible API,
4. zapis tematow, z ktorych potem mozna uruchomic enrichment,
5. chunking tekstu,
6. zapis do `work-assistant-api`.

## Prerequisites

Najpierw musza dzialac:

- `work-assistant-db`
- `work-assistant-api`

oraz:

- zaleznosci lokalne:
  - `pip install -r scripts/requirements-backfill.txt`
- `APP_API_KEY` ustawiony w `work-assistant-api`
- dostepny klucz do Claude-compatible endpointu

## Required environment variables

```text
DRIVE_FOLDER_ID=1Zq9MPcvbzhr6UeGS5EfdwhKVol2Upltm
WORK_ASSISTANT_API_URL=https://YOUR-WORK-ASSISTANT-API.up.railway.app
WORK_ASSISTANT_API_KEY=FILL_ME
LLM_API_URL=https://api.quatarly.cloud/v0/chat/completions
LLM_API_KEY=FILL_ME
LLM_MODEL=claude-sonnet-4-6-20250929
EMBEDDING_API_URL=FILL_ME
EMBEDDING_API_KEY=FILL_ME
EMBEDDING_MODEL=FILL_ME
```

Optional:

```text
BACKFILL_OFFSET=0
BACKFILL_LIMIT=0
MAIL_CHUNK_SIZE=1400
MAIL_CHUNK_OVERLAP=200
```

## Run

Z katalogu repo:

```bash
python3 scripts/backfill_mail_to_work_assistant.py
```

## Incremental dry run strategy

Nie zaczynaj od calych ~2800 maili.

Najpierw:

```bash
BACKFILL_LIMIT=5 python3 scripts/backfill_mail_to_work_assistant.py
```

Potem:

```bash
BACKFILL_LIMIT=50 python3 scripts/backfill_mail_to_work_assistant.py
```

Dopiero po sprawdzeniu jakosci analiz i struktury danych:

```bash
python3 scripts/backfill_mail_to_work_assistant.py
```

## Important behavior

- backfill nie tworzy jeszcze historycznych taskow w Vikunja,
- API deduplikuje po `source_type + external_id + checksum`,
- ponowny run nie powinien duplikowac tych samych rewizji,
- jesli ustawisz embeddingi, chunks beda zapisane od razu z wektorami.
