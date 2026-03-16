import json
from typing import Any

from openai import OpenAI
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import settings
from .models import Meeting


def upsert_meeting(db: Session, data: dict[str, Any]) -> Meeting:
    meeting = Meeting(
        title=data["title"],
        meeting_date=data["meeting_date"],
        duration_seconds=data["duration_seconds"],
        drive_file_id=data.get("drive_file_id"),
        metadata=data.get("metadata", {}),
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def semantic_search(db: Session, query_vector: list[float], limit: int = 8) -> list[dict[str, Any]]:
    sql = text(
        """
        SELECT tc.text, tc.timestamp, m.title, m.meeting_date,
               tc.embedding <=> CAST(:embedding AS vector) AS distance
        FROM transcript_chunks tc
        JOIN meetings m ON tc.meeting_id = m.id
        WHERE tc.embedding IS NOT NULL
        ORDER BY tc.embedding <=> CAST(:embedding AS vector)
        LIMIT :limit
        """
    )
    rows = db.execute(sql, {"embedding": json.dumps(query_vector), "limit": limit}).mappings().all()
    return [dict(r) for r in rows]


def chat_answer(db: Session, question: str) -> dict[str, Any]:
    if not settings.openai_api_key:
        return {"answer": "OPENAI_API_KEY is not configured.", "context": []}

    client = OpenAI(api_key=settings.openai_api_key)
    embedding = client.embeddings.create(model=settings.openai_embed_model, input=question).data[0].embedding
    context_rows = semantic_search(db, embedding, limit=8)
    context_text = "\n\n".join(
        f"[{r['meeting_date']} - {r['title']} @ {r['timestamp']}] {r['text']}" for r in context_rows
    )

    prompt = f"""Answer the user question using only meeting context. If unknown, say unknown.

Question: {question}

Meeting context:
{context_text}
"""
    completion = client.chat.completions.create(
        model=settings.openai_chat_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    return {"answer": completion.choices[0].message.content, "context": context_rows}
