"""Meeting API routes — CRUD, lifecycle, participants, host controls."""

import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db, utcnow
from ..models import Meeting, MeetingHistory, Participant
from ..schemas import (
    JoinOut,
    JoinRequest,
    KickRequest,
    LeaveRequest,
    MeetingBase,
    MeetingOut,
    ParticipantOut,
)
from ..services import HOST_NAME, create_meeting, meeting_out

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _base_url(request: Request) -> str:
    """Derive the frontend base URL from the incoming request."""
    return str(request.base_url).rstrip("/").replace(":8000", ":3000")


def _get_meeting(db: Session, meeting_id: str) -> Meeting:
    meeting = db.scalar(
        select(Meeting).where(Meeting.meeting_id == meeting_id)
    )
    if not meeting:
        raise HTTPException(
            status_code=404,
            detail="Meeting not found. Check the meeting ID or invitation link.",
        )
    return meeting


def _output(meeting: Meeting, request: Request) -> MeetingOut:
    return MeetingOut(**meeting_out(meeting, _base_url(request)))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/instant", response_model=MeetingOut, status_code=status.HTTP_201_CREATED
)
def instant(request: Request, db: Session = Depends(get_db)):
    """Create and immediately activate an instant meeting."""
    now = utcnow()
    data = create_meeting(
        db,
        title="Instant meeting",
        description="A new meeting room created on the fly.",
        scheduled_time=now,
        duration=60,
        base_url=_base_url(request),
        status="active",
    )
    obj = db.scalar(
        select(Meeting).where(Meeting.meeting_id == data["meeting_id"])
    )
    # create_meeting already committed with status="active", just ensure history
    db.add(
        MeetingHistory(meeting_id=obj.id, action="started", timestamp=now)
    )
    db.commit()
    db.refresh(obj)
    return _output(obj, request)


@router.post(
    "/schedule", response_model=MeetingOut, status_code=status.HTTP_201_CREATED
)
def schedule(
    payload: MeetingBase,
    request: Request,
    db: Session = Depends(get_db),
):
    """Schedule a meeting for a future time."""
    if payload.scheduled_time <= utcnow():
        raise HTTPException(
            status_code=422,
            detail="Scheduled time must be in the future.",
        )
    return create_meeting(
        db,
        title=payload.title,
        description=payload.description,
        scheduled_time=payload.scheduled_time,
        duration=payload.duration_minutes,
        base_url=_base_url(request),
    )


@router.get("/upcoming", response_model=list[MeetingOut])
def upcoming(request: Request, db: Session = Depends(get_db)):
    """Return scheduled or active meetings that haven't ended."""
    cutoff = utcnow() - timedelta(minutes=5)
    meetings = (
        db.scalars(
            select(Meeting)
            .where(
                Meeting.status.in_(["scheduled", "active"]),
                Meeting.scheduled_time >= cutoff,
            )
            .order_by(Meeting.scheduled_time)
        )
        .all()
    )
    return [_output(m, request) for m in meetings]


@router.get("/recent", response_model=list[MeetingOut])
def recent(request: Request, db: Session = Depends(get_db)):
    """Return the 10 most-recently ended meetings."""
    meetings = (
        db.scalars(
            select(Meeting)
            .where(Meeting.status == "ended")
            .order_by(Meeting.ended_at.desc().nullslast())
            .limit(10)
        )
        .all()
    )
    return [_output(m, request) for m in meetings]


@router.get("/{meeting_id}", response_model=MeetingOut)
def details(
    meeting_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Get the details of a single meeting by its short ID."""
    return _output(_get_meeting(db, meeting_id), request)


@router.post("/join", response_model=JoinOut)
def join(
    payload: JoinRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Register a participant into a meeting and activate it if needed."""
    meeting = _get_meeting(db, payload.meeting_id)

    if meeting.status == "ended":
        raise HTTPException(
            status_code=409,
            detail="This meeting has ended and is no longer available.",
        )

    session_id = payload.session_id or secrets.token_urlsafe(18)

    # Re-join or create
    existing = db.scalar(
        select(Participant).where(
            Participant.meeting_id == meeting.id,
            Participant.session_id == session_id,
        )
    )
    if existing:
        existing.left_at = None
        existing.display_name = payload.display_name
        existing.is_host = (payload.display_name == HOST_NAME)
        participant = existing
    else:
        # Prevent unique constraint collision if session_id exists in another meeting
        existing_any = db.scalar(
            select(Participant).where(Participant.session_id == session_id)
        )
        if existing_any:
            session_id = secrets.token_urlsafe(18)

        participant = Participant(
            meeting_id=meeting.id,
            display_name=payload.display_name,
            is_host=(payload.display_name == HOST_NAME),
            joined_at=utcnow(),
            session_id=session_id,
        )
        db.add(participant)

    # Activate the meeting if it was still scheduled
    if meeting.status == "scheduled":
        meeting.status = "active"

    db.add(
        MeetingHistory(
            meeting_id=meeting.id,
            action=f"joined:{payload.display_name}",
            timestamp=utcnow(),
        )
    )
    db.commit()
    db.refresh(participant)
    db.refresh(meeting)

    return JoinOut(
        meeting=_output(meeting, request),
        participant_id=participant.id,
        session_id=session_id,
        is_host=participant.is_host,
    )


@router.post("/{meeting_id}/leave")
def leave(
    meeting_id: str,
    payload: LeaveRequest,
    db: Session = Depends(get_db),
):
    """Mark a participant as having left the meeting (without ending it)."""
    meeting = _get_meeting(db, meeting_id)
    participant = db.scalar(
        select(Participant).where(
            Participant.meeting_id == meeting.id,
            Participant.session_id == payload.session_id,
            Participant.left_at.is_(None),
        )
    )
    if not participant:
        raise HTTPException(
            status_code=404, detail="Active participant session not found."
        )
    participant.left_at = utcnow()
    db.add(
        MeetingHistory(
            meeting_id=meeting.id,
            action=f"left:{participant.display_name}",
            timestamp=utcnow(),
        )
    )
    db.commit()
    return {"ok": True}


@router.get("/{meeting_id}/participants", response_model=list[ParticipantOut])
def participants(meeting_id: str, db: Session = Depends(get_db)):
    """Return the currently active participants in a meeting."""
    meeting = _get_meeting(db, meeting_id)
    return (
        db.scalars(
            select(Participant)
            .where(
                Participant.meeting_id == meeting.id,
                Participant.left_at.is_(None),
            )
            .order_by(Participant.is_host.desc(), Participant.joined_at)
        )
        .all()
    )


@router.post("/{meeting_id}/end", response_model=MeetingOut)
def end(
    meeting_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """End a meeting and mark all remaining participants as having left."""
    meeting = _get_meeting(db, meeting_id)
    if meeting.status == "ended":
        return _output(meeting, request)

    now = utcnow()
    meeting.status = "ended"
    meeting.ended_at = now

    for p in meeting.participants:
        if p.left_at is None:
            p.left_at = now

    db.add(
        MeetingHistory(
            meeting_id=meeting.id, action="ended", timestamp=now
        )
    )
    db.commit()
    db.refresh(meeting)
    return _output(meeting, request)


@router.post("/{meeting_id}/kick")
def kick(
    meeting_id: str,
    payload: KickRequest,
    db: Session = Depends(get_db),
):
    """
    Host-only: remove a participant from the meeting.

    The caller must provide their own session_id (host_session_id) so we can
    verify they are the host.  This is NOT real auth — it relies on the
    honour system that only the real host knows their session_id.
    """
    meeting = _get_meeting(db, meeting_id)

    # Verify the requester is the host
    host = db.scalar(
        select(Participant).where(
            Participant.meeting_id == meeting.id,
            Participant.session_id == payload.host_session_id,
            Participant.is_host.is_(True),
            Participant.left_at.is_(None),
        )
    )
    if not host:
        raise HTTPException(
            status_code=403,
            detail="Only the meeting host can remove participants.",
        )

    target = db.scalar(
        select(Participant).where(
            Participant.id == payload.participant_id,
            Participant.meeting_id == meeting.id,
            Participant.left_at.is_(None),
        )
    )
    if not target:
        raise HTTPException(
            status_code=404, detail="Participant not found or already left."
        )

    if target.id == host.id:
        raise HTTPException(
            status_code=400, detail="Host cannot remove themselves with kick."
        )

    if target.is_host:
        raise HTTPException(
            status_code=400, detail="Cannot kick a meeting host."
        )

    target.left_at = utcnow()
    db.add(
        MeetingHistory(
            meeting_id=meeting.id,
            action=f"kicked:{target.display_name}",
            timestamp=utcnow(),
        )
    )
    db.commit()
    return {"ok": True, "removed": target.display_name}
