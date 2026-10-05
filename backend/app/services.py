"""Business logic helpers: ID generation, meeting creation, seeding."""

import os
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlparse

from fastapi import Request
from sqlalchemy import delete, func, select
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
        "is_seed": bool(getattr(meeting, "is_seed", False)),
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


# ---- Seed data (5 upcoming, 5 recent) ------------------------------------

_SEED_UPCOMING = [
    (
        "Product Design Sync",
        timedelta(hours=3),
        45,
        "scheduled",
        "Review the refreshed onboarding journey and component library.",
    ),
    (
        "Engineering Standup",
        timedelta(days=1, hours=4),
        30,
        "scheduled",
        "Daily team alignment, blockers, and sprint check-in.",
    ),
    (
        "Client Strategy Review",
        timedelta(days=2, hours=2),
        60,
        "scheduled",
        "Quarterly roadmap walkthrough with stakeholders.",
    ),
    (
        "Design System Workshop",
        timedelta(days=3, hours=5),
        45,
        "scheduled",
        "Exploring typography tokens, icons, and layout updates.",
    ),
    (
        "Weekly Executive Sync",
        timedelta(days=4, hours=1),
        30,
        "scheduled",
        "Leadership updates, metrics review, and organizational milestones.",
    ),
]

_SEED_RECENT = [
    (
        "Sprint Retrospective",
        timedelta(days=-1, hours=-2),
        45,
        "ended",
        "Reviewing completed sprint deliverables, successes, and improvements.",
    ),
    (
        "Q3 Planning Room",
        timedelta(days=-2, hours=-3),
        60,
        "ended",
        "Quarterly planning, resource allocation, and priorities.",
    ),
    (
        "Product Architecture Review",
        timedelta(days=-3, hours=-1),
        45,
        "ended",
        "Deep dive into real-time audio/video streaming infrastructure.",
    ),
    (
        "Marketing Debrief",
        timedelta(days=-4, hours=-4),
        45,
        "ended",
        "Post-campaign analysis, reach metrics, and key learnings.",
    ),
    (
        "All-Hands Kickoff",
        timedelta(days=-6, hours=-2),
        60,
        "ended",
        "Company-wide kickoff meeting and quarter goal alignments.",
    ),
]

_SEED = _SEED_UPCOMING + _SEED_RECENT


def seed_meetings(db: Session, base_url: str, force: bool = False) -> None:
    """Ensure exactly 5 upcoming and 5 recent realistic demo meetings exist."""
    now = utcnow()
    if force:
        db.execute(delete(Participant))
        db.execute(delete(MeetingHistory))
        db.execute(delete(Meeting).where(Meeting.user_id.is_(None)))
        db.commit()

    # Check upcoming count
    upcoming_count = db.scalar(
        select(func.count(Meeting.id)).where(
            Meeting.status.in_(["scheduled", "active"]),
            Meeting.scheduled_time >= now - timedelta(minutes=5),
        )
    ) or 0

    if upcoming_count < 5:
        needed = 5 - upcoming_count
        for title, offset, duration, status, desc in _SEED_UPCOMING[-needed:]:
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
                created_at=now - timedelta(days=2),
                is_seed=True,
            )
            db.add(meeting)
            db.flush()
            db.add(MeetingHistory(meeting_id=meeting.id, action="seeded", timestamp=now))
        db.commit()

    # Check ended recent count
    recent_count = db.scalar(
        select(func.count(Meeting.id)).where(Meeting.status == "ended")
    ) or 0

    if recent_count < 5:
        needed = 5 - recent_count
        for title, offset, duration, status, desc in _SEED_RECENT[-needed:]:
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
                created_at=now + offset - timedelta(hours=1),
                ended_at=now + offset + timedelta(minutes=duration),
                is_seed=True,
            )
            db.add(meeting)
            db.flush()
            db.add(MeetingHistory(meeting_id=meeting.id, action="seeded", timestamp=now))
        db.commit()
