"""SQLAlchemy ORM models for meetings, participants, and history."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Meeting(Base):
    """A video-conference meeting room."""

    __tablename__ = "meetings"
    __table_args__ = (
        Index("ix_meetings_status_scheduled", "status", "scheduled_time"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    invite_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    host_name: Mapped[str] = mapped_column(String(100), default="Alex Morgan")
    scheduled_time: Mapped[datetime] = mapped_column(DateTime, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[str] = mapped_column(String(20), default="scheduled", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    participants: Mapped[list["Participant"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    history: Mapped[list["MeetingHistory"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )


class Participant(Base):
    """A person who has joined a meeting."""

    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    display_name: Mapped[str] = mapped_column(String(100))
    is_host: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime)
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    session_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    meeting: Mapped[Meeting] = relationship(back_populates="participants")


class MeetingHistory(Base):
    """Audit log entry for meeting lifecycle events."""

    __tablename__ = "meeting_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), index=True
    )
    action: Mapped[str] = mapped_column(String(80))
    timestamp: Mapped[datetime] = mapped_column(DateTime)

    meeting: Mapped[Meeting] = relationship(back_populates="history")
