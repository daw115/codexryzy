from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from .db import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    meeting_date = Column(String(20), nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    drive_file_id = Column(String(255), nullable=True)
    metadata = Column(JSON, nullable=True)
    summary_md = Column(Text, nullable=True)
    tasks = Column(JSON, nullable=True)
    decisions = Column(JSON, nullable=True)
    topics = Column(JSON, nullable=True)
    transcript = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    chunks = relationship("TranscriptChunk", back_populates="meeting", cascade="all, delete-orphan")


class TranscriptChunk(Base):
    __tablename__ = "transcript_chunks"

    id = Column(Integer, primary_key=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    timestamp = Column(String(32), nullable=True)
    text = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=True)

    meeting = relationship("Meeting", back_populates="chunks")
