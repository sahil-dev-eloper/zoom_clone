"""Business logic helpers: ID generation, meeting creation, seeding."""

import os
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlparse

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import utcnow
from .models import Meeting, MeetingHistory, Participant

# The default host identity.  Not a real auth system — documented as a
# limitation.  Any user whose display_name matches HOST_NAME is treated as
# host for the purpose of join logic.
HOST_NAME = "Sahil Dargar"

_discovered_frontend_url: str | None = None


def record_frontend_origin(request: Request) -> None:
    """Track the latest client origin seen so redirects can locate the frontend."""
    global _discovered_frontend_url
    origin = request.headers.get("origin")
    if origin and "onrender.com" not in origin:
        _discovered_frontend_url = origin.rstrip("/")
        return
    referer = request.headers.get("referer")
    if referer:
        try:
            p = urlparse(referer)
            if p.scheme and p.netloc and "onrender.com" not in p.netloc:
                _discovered_frontend_url = f"{p.scheme}://{p.netloc}"
        except Exception:
            pass


def get_frontend_base(request: Request) -> str:
    """Derive the frontend base URL from client Origin, Referer, env, or cache."""
    record_frontend_origin(request)

    # 1. Prefer client Origin header (from browser fetch requests)
    origin = request.headers.get("origin")
    if origin and "onrender.com" not in origin:
        return origin.rstrip("/")

    # 2. Check FRONTEND_URL environment variable if set to external domain
    frontend_env = os.getenv("FRONTEND_URL")
    if (
        frontend_env
        and "localhost" not in frontend_env
        and "127.0.0.1" not in frontend_env
        and "onrender.com" not in frontend_env
    ):
        return frontend_env.rstrip("/")

    # 3. Check Referer header (e.g. from Vercel deployment)
    referer = request.headers.get("referer")
    if referer:
        try:
            p = urlparse(referer)
            if p.scheme and p.netloc and "onrender.com" not in p.netloc:
                return f"{p.scheme}://{p.netloc}"
        except Exception:
            pass

    # 4. Check cached/discovered frontend origin from prior frontend API calls
    global _discovered_frontend_url
    if _discovered_frontend_url:
        return _discovered_frontend_url

    # 5. Check if request came from local dev
    if origin and ("localhost" in origin or "127.0.0.1" in origin):
        return origin.rstrip("/")

    # 6. Fallback from environment or local default
    if frontend_env and "onrender.com" not in frontend_env:
        return frontend_env.rstrip("/")
    return str(request.base_url).rstrip("/").replace(":8000", ":3000")


def meeting_out(meeting: Meeting, base_url: str) -> dict:
    """Shape a Meeting ORM instance into a dict that matches MeetingOut."""
    return {
        "meeting_id": meeting.meeting_id,
        "invite_token": meeting.invite_token,
        "title": meeting.title,
        "description": meeting.description,
        "host_name": meeting.host_name,
        "scheduled_time": meeting.scheduled_time,
        "duration_minutes": meeting.duration_minutes,
        "status": meeting.status,
        "created_at": meeting.created_at,
        "ended_at": meeting.ended_at,
        "invite_url": (
            f"{base_url}/join?meeting={meeting.meeting_id}"
            f"&token={meeting.invite_token}"
        ),
        "participant_count": sum(
            1 for p in meeting.participants if p.left_at is None
        ),
    }


def unique_ids(db: Session) -> tuple[str, str]:
    """Generate a collision-resistant 6-digit meeting ID and secure token."""
    while True:
        meeting_id = f"{secrets.randbelow(900000) + 100000}"
        token = secrets.token_urlsafe(32)
        exists = db.scalar(
            select(Meeting).where(Meeting.meeting_id == meeting_id)
        )
        if not exists:
            return meeting_id, token


def create_meeting(
    db: Session,
    *,
    title: str,
    description: str | None,
    scheduled_time: datetime,
    duration: int,
    base_url: str,
    status: str = "scheduled",
) -> dict:
    """Insert a new meeting and its initial history entry."""
    meeting_id, token = unique_ids(db)
    meeting = Meeting(
        meeting_id=meeting_id,
        invite_token=token,
        title=title,
        description=description,
        host_name=HOST_NAME,
        scheduled_time=scheduled_time,
        duration_minutes=duration,
        status=status,
        created_at=utcnow(),
    )
    db.add(meeting)
    db.flush()
    db.add(
        MeetingHistory(
            meeting_id=meeting.id, action="created", timestamp=utcnow()
        )
    )
    db.commit()
    db.refresh(meeting)
    return meeting_out(meeting, base_url)


# ---- Seed data (runs once if the table is empty) -------------------------

_SEED = [
    (
        "Product design sync",
        timedelta(days=1, hours=2),
        45,
        "scheduled",
        "Review the refreshed onboarding journey and component library.",
    ),
    (
        "Engineering standup",
        timedelta(days=2, hours=5),
        30,
        "scheduled",
        "Daily team alignment, blockers, and sprint check-in.",
    ),
    (
        "Client strategy review",
        timedelta(days=3, hours=1),
        60,
        "scheduled",
        "Quarterly roadmap walkthrough with stakeholders.",
    ),
    (
        "Q3 planning room",
        timedelta(days=-2),
        60,
        "ended",
        "Quarterly planning and priorities.",
    ),
    (
        "Marketing debrief",
        timedelta(days=-5),
        45,
        "ended",
        "Post-campaign analysis and key learnings.",
    ),
]


def seed_meetings(db: Session, base_url: str) -> None:
    """Insert realistic demo meetings if the table is empty."""
    if db.scalar(select(Meeting.id).limit(1)):
        return  # already seeded

    now = utcnow()
    for title, offset, duration, status, desc in _SEED:
        meeting_id, token = unique_ids(db)
        meeting = Meeting(
            meeting_id=meeting_id,
            invite_token=token,
            title=title,
            description=desc,
            host_name=HOST_NAME,
            scheduled_time=now + offset,
            duration_minutes=duration,
            status=status,
            created_at=now - timedelta(days=4),
        )
        if status == "ended":
            meeting.ended_at = now + offset + timedelta(minutes=duration)
        db.add(meeting)
        db.flush()
        db.add(
            MeetingHistory(
                meeting_id=meeting.id,
                action="seeded",
                timestamp=now - timedelta(days=4),
            )
        )
    db.commit()
