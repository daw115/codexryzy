FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY app ./app
COPY migrate.py ./migrate.py
COPY sql ./sql

RUN pip install --no-cache-dir .

EXPOSE 8080

CMD ["sh", "-lc", "python migrate.py && uvicorn app.main:app --host 0.0.0.0 --port 8080"]
