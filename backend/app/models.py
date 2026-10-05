"""SQLAlchemy ORM models for meetings, participants, and history."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    """A registered user account."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100))
    pmi: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    meetings: Mapped[list["Meeting"]] = relationship(back_populates="user")
    participants: Mapped[list["Participant"]] = relationship(back_populates="user")


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
    host_name: Mapped[str] = mapped_column(String(100), default="Sahil Dargar")
    scheduled_time: Mapped[datetime] = mapped_column(DateTime, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[str] = mapped_column(String(20), default="scheduled", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_seed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)

    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user: Mapped[Optional["User"]] = relationship(back_populates="meetings")

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
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    display_name: Mapped[str] = mapped_column(String(100))
    is_host: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime)
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    session_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    meeting: Mapped[Meeting] = relationship(back_populates="participants")
    user: Mapped[Optional["User"]] = relationship(back_populates="participants")


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
