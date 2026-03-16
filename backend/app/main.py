from fastapi import Depends, FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, engine, get_db
from .models import Meeting
from .schemas import ChatRequest, MeetingOut, SearchRequest
from .services import chat_answer, semantic_search, upsert_meeting

app = FastAPI(title="AI Meeting Brain API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.backend_cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/meetings/upload")
async def upload_meeting(
    file: UploadFile = File(...),
    title: str = Form(...),
    meeting_date: str = Form(...),
    duration_seconds: int = Form(...),
    db: Session = Depends(get_db),
):
    # In production this file is streamed to Google Drive using resumable upload.
    _ = await file.read()
    meeting = upsert_meeting(
        db,
        {
            "title": title,
            "meeting_date": meeting_date,
            "duration_seconds": duration_seconds,
            "metadata": {"filename": file.filename, "content_type": file.content_type},
        },
    )
    return {"id": meeting.id, "status": "uploaded"}


@app.get("/api/meetings", response_model=list[MeetingOut])
def list_meetings(db: Session = Depends(get_db)):
    return db.query(Meeting).order_by(Meeting.id.desc()).all()


@app.post("/api/search")
def search(req: SearchRequest, db: Session = Depends(get_db)):
    # Placeholder: client should call /api/chat for full RAG answer.
    dummy = [0.0] * 1536
    return semantic_search(db, dummy, limit=5)


@app.post("/api/chat")
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    return chat_answer(db, req.question)
