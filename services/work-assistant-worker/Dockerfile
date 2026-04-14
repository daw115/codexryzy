FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements-worker.txt ./requirements-worker.txt
COPY work_assistant_pipeline.py ./work_assistant_pipeline.py
COPY web_enrichment_worker.py ./web_enrichment_worker.py

RUN pip install --no-cache-dir -r requirements-worker.txt

CMD ["python", "web_enrichment_worker.py"]
