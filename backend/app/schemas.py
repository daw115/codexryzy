from pydantic import BaseModel
from typing import Any


class UploadMetadata(BaseModel):
    title: str
    meeting_date: str
    duration_seconds: int


class MeetingOut(BaseModel):
    id: int
    title: str
    meeting_date: str
    duration_seconds: int
    summary_md: str | None = None
    tasks: list[dict[str, Any]] | None = None
    decisions: list[dict[str, Any]] | None = None
    topics: list[dict[str, Any]] | None = None

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    question: str


class SearchRequest(BaseModel):
    query: str
