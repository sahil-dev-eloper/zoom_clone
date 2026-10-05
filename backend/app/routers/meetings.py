"""Meeting API routes — CRUD, lifecycle, participants, host controls."""

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user_optional
from ..database import get_db, utcnow
from ..models import Meeting, MeetingHistory, Participant, User
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
    """Derive the frontend base URL from client Origin, Referer, env, or cache."""
    from ..services import get_frontend_base

    return get_frontend_base(request)


def _get_meeting(db: Session, meeting_id: str, auto_create: bool = False) -> Meeting:
    clean_id = meeting_id.strip()
    meeting = db.scalar(
        select(Meeting).where(Meeting.meeting_id == clean_id)
    )
    if not meeting:
        if auto_create:
            now = utcnow()
            meeting = Meeting(
                meeting_id=clean_id,
                invite_token=secrets.token_urlsafe(32),
                title=f"Zoom Meeting {clean_id}",
                description="Active Zoom Meeting Room",
                host_name=HOST_NAME,
                scheduled_time=now,
                duration_minutes=60,
                status="active",
                created_at=now,
                is_seed=False,
            )
            db.add(meeting)
            db.flush()
            db.add(
                MeetingHistory(
                    meeting_id=meeting.id,
                    action="created:on-demand",
                    timestamp=now,
                )
            )
            db.commit()
            db.refresh(meeting)
            return meeting
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
def instant(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Create and immediately activate an instant meeting with default name 'Instant meeting'."""
    now = utcnow()
    host_display_name = current_user.display_name if current_user else HOST_NAME
    data = create_meeting(
        db,
        title="Instant meeting",
        description="Instant meeting room created on the fly.",
        scheduled_time=now,
        duration=0,
        base_url=_base_url(request),
        status="active",
        is_seed=False,
    )
    obj = db.scalar(
        select(Meeting).where(Meeting.meeting_id == data["meeting_id"])
    )
    obj.title = "Instant meeting"
    obj.is_seed = False
    if current_user:
        obj.host_name = current_user.display_name
        obj.user_id = current_user.id
    db.add(
        MeetingHistory(meeting_id=obj.id, action="started:instant", timestamp=now)
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
    current_user: User | None = Depends(get_current_user_optional),
):
    """Schedule a meeting for a future time."""
    if payload.scheduled_time <= utcnow():
        raise HTTPException(
            status_code=422,
            detail="Scheduled time must be in the future.",
        )
    created = create_meeting(
        db,
        title=payload.title,
        description=payload.description,
        scheduled_time=payload.scheduled_time,
        duration=payload.duration_minutes,
        base_url=_base_url(request),
        is_seed=False,
    )
    obj = db.scalar(select(Meeting).where(Meeting.meeting_id == created["meeting_id"]))
    if obj:
        if current_user:
            obj.host_name = current_user.display_name
            obj.user_id = current_user.id
        obj.is_seed = False
        db.commit()
        db.refresh(obj)
        return _output(obj, request)
    return MeetingOut(**created)


@router.get("/upcoming", response_model=list[MeetingOut])
def upcoming(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Return only future scheduled meetings (not yet started).
    Once a meeting's scheduled_time passes, it no longer appears here — it moves to recents.
    Seed demo data (5 entries) is always shown as a baseline.
    """
    now = utcnow()

    # 1. Exactly 5 seed demo upcoming meetings (shown to everyone as baseline demo data)
    seed_upcoming = (
        db.scalars(
            select(Meeting)
            .where(
                Meeting.is_seed.is_(True),
                Meeting.status == "scheduled",
                Meeting.scheduled_time >= now,
            )
            .order_by(Meeting.scheduled_time)
            .limit(5)
        )
        .all()
    )

    # 2. User's own future scheduled meetings (if logged in)
    user_upcoming: list[Meeting] = []
    if current_user:
        participant_meeting_ids = select(Participant.meeting_id).where(
            Participant.user_id == current_user.id
        )
        user_upcoming = (
            db.scalars(
                select(Meeting)
                .where(
                    (Meeting.is_seed.is_(False) | Meeting.is_seed.is_(None)),
                    Meeting.status == "scheduled",
                    Meeting.scheduled_time >= now,
                    (
                        (Meeting.user_id == current_user.id)
                        | Meeting.id.in_(participant_meeting_ids)
                    ),
                )
                .order_by(Meeting.scheduled_time)
            )
            .all()
        )

    # User's own meetings first, followed by seed demo meetings
    combined = list(user_upcoming) + list(seed_upcoming)
    return [_output(m, request) for m in combined]


@router.get("/recent", response_model=list[MeetingOut])
def recent(
    request: Request,
    meeting_ids: str | None = None,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Return recent meetings for the logged-in user (both host and participants),
    plus the 5 seed demo history meetings.
    Includes:
    - Active meetings (host hasn't ended → can rejoin)
    - Ended meetings (past history)
    - Past-due scheduled meetings (scheduled_time passed but never started)
    """
    now = utcnow()

    # 1. 5 Seed demo meetings (ended past history records)
    seed_recent = (
        db.scalars(
            select(Meeting)
            .where(
                Meeting.is_seed.is_(True),
                Meeting.status == "ended",
            )
            .order_by(Meeting.ended_at.desc().nullslast())
            .limit(5)
        )
        .all()
    )

    user_meetings: list[Meeting] = []
    seen_ids: set[str] = set()

    # 2. Gather user's recent meetings if logged in
    if current_user:
        participant_meeting_ids = select(Participant.meeting_id).where(
            Participant.user_id == current_user.id
        )
        user_cond = (
            (Meeting.is_seed.is_(False) | Meeting.is_seed.is_(None))
            & (
                (Meeting.user_id == current_user.id)
                | Meeting.id.in_(participant_meeting_ids)
            )
        )

        # Active meetings (host hasn't ended meeting for all -> can rejoin!)
        active_user_meetings = (
            db.scalars(
                select(Meeting)
                .where(
                    user_cond,
                    Meeting.status == "active",
                )
                .order_by(Meeting.created_at.desc())
            )
            .all()
        )

        # Ended meetings (past history)
        ended_user_meetings = (
            db.scalars(
                select(Meeting)
                .where(
                    user_cond,
                    Meeting.status == "ended",
                )
                .order_by(Meeting.ended_at.desc().nullslast())
                .limit(20)
            )
            .all()
        )

        # Past-due scheduled meetings (time passed but never started)
        pastdue_user_meetings = (
            db.scalars(
                select(Meeting)
                .where(
                    user_cond,
                    Meeting.status == "scheduled",
                    Meeting.scheduled_time < now,
                )
                .order_by(Meeting.scheduled_time.desc())
                .limit(20)
            )
            .all()
        )

        for m in list(active_user_meetings) + list(ended_user_meetings) + list(pastdue_user_meetings):
            if m.meeting_id not in seen_ids:
                seen_ids.add(m.meeting_id)
                user_meetings.append(m)

    # 3. Extra recent meeting IDs (e.g. from local storage session in browser)
    if meeting_ids:
        raw_ids = [mid.strip() for mid in meeting_ids.split(",") if mid.strip()]
        if raw_ids:
            extra_meetings = (
                db.scalars(
                    select(Meeting).where(
                        Meeting.meeting_id.in_(raw_ids),
                        (Meeting.is_seed.is_(False) | Meeting.is_seed.is_(None)),
                    )
                )
                .all()
            )
            extra_sorted = sorted(
                extra_meetings,
                key=lambda m: (0 if m.status == "active" else 1, -(m.created_at.timestamp() if m.created_at else 0)),
            )
            for m in extra_sorted:
                if m.meeting_id not in seen_ids:
                    seen_ids.add(m.meeting_id)
                    user_meetings.append(m)

    # User's recent meetings first, followed by the 5 seed demo meetings
    combined = user_meetings + list(seed_recent)
    return [_output(m, request) for m in combined]


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
    current_user: User | None = Depends(get_current_user_optional),
):
    """Register a participant into a meeting and activate it if needed."""
    meeting = _get_meeting(db, payload.meeting_id)

    if meeting.status == "ended":
        raise HTTPException(
            status_code=409,
            detail="This meeting has ended and is no longer available.",
        )

    session_id = payload.session_id or secrets.token_urlsafe(18)
    display_name_to_use = payload.display_name or (current_user.display_name if current_user else "Participant")

    # Check if there is already an active host in this meeting
    active_host = db.scalar(
        select(Participant).where(
            Participant.meeting_id == meeting.id,
            Participant.is_host.is_(True),
            Participant.left_at.is_(None),
        )
    )

    # Determine whether this participant is the host:
    # 1. If payload explicitly asks is_host=False, never host.
    # 2. If current_user matches meeting creator (user_id): host!
    # 3. If payload explicitly asks is_host=True, then host.
    # 4. If an active host already exists with a different session_id, newcomer is not host.
    # 5. Otherwise, only host if no active host exists in room and display_name matches meeting.host_name.
    if payload.is_host is False:
        determined_is_host = False
    elif current_user and meeting.user_id and meeting.user_id == current_user.id:
        determined_is_host = True
    elif payload.is_host is True:
        determined_is_host = True
    elif active_host and active_host.session_id != session_id:
        determined_is_host = False
    else:
        determined_is_host = (not active_host and display_name_to_use == meeting.host_name)

    # Link meeting to current_user if host created it without auth initially
    if current_user and not meeting.user_id and determined_is_host:
        meeting.user_id = current_user.id
        meeting.host_name = current_user.display_name

    # Re-join or create
    existing = db.scalar(
        select(Participant).where(
            Participant.meeting_id == meeting.id,
            Participant.session_id == session_id,
        )
    )
    if existing:
        existing.left_at = None
        existing.display_name = display_name_to_use
        existing.is_host = determined_is_host
        if current_user:
            existing.user_id = current_user.id
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
            user_id=current_user.id if current_user else None,
            display_name=display_name_to_use,
            is_host=determined_is_host,
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
            status_code=404,
            detail="Participant session not found.",
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
