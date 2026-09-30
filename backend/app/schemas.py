"""Pydantic request/response schemas."""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field, field_serializer, field_validator


# ---------------------------------------------------------------------------
# Meeting
# ---------------------------------------------------------------------------

class MeetingBase(BaseModel):
    """Payload for creating or scheduling a meeting."""

    title: str = Field(min_length=2, max_length=160)
    description: Optional[str] = Field(default=None, max_length=1000)
    scheduled_time: datetime
    duration_minutes: int = Field(default=30, ge=15, le=480)

    @field_validator("scheduled_time")
    @classmethod
    def normalize_time(cls, value: datetime) -> datetime:
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value


class MeetingOut(BaseModel):
    """Standard meeting response returned by every endpoint."""

    meeting_id: str
    invite_token: str
    title: str
    description: Optional[str]
    host_name: str
    scheduled_time: datetime
    duration_minutes: int
    status: str
    created_at: datetime
    ended_at: Optional[datetime] = None
    invite_url: str
    participant_count: int = 0

    model_config = {"from_attributes": True}

    @field_serializer("scheduled_time", "created_at", "ended_at", when_used="json")
    def serialize_utc_datetime(self, v: Optional[datetime]) -> Optional[str]:
        if v is None:
            return None
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()


# ---------------------------------------------------------------------------
# Join / Leave
# ---------------------------------------------------------------------------

class JoinRequest(BaseModel):
    meeting_id: str = Field(min_length=3, max_length=64)
    display_name: str = Field(min_length=2, max_length=100)
    session_id: Optional[str] = None


class JoinOut(BaseModel):
    meeting: MeetingOut
    participant_id: int
    session_id: str
    is_host: bool


class LeaveRequest(BaseModel):
    session_id: str


# ---------------------------------------------------------------------------
# Participant
# ---------------------------------------------------------------------------

class ParticipantOut(BaseModel):
    id: int
    display_name: str
    is_host: bool
    joined_at: datetime
    left_at: Optional[datetime]
    session_id: str

    model_config = {"from_attributes": True}

    @field_serializer("joined_at", "left_at", when_used="json")
    def serialize_utc_datetime(self, v: Optional[datetime]) -> Optional[str]:
        if v is None:
            return None
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()


# ---------------------------------------------------------------------------
# Host controls
# ---------------------------------------------------------------------------

class KickRequest(BaseModel):
    """Body for host-only participant removal."""
    host_session_id: str
    participant_id: int
