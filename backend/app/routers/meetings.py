"""Meeting API routes — CRUD, lifecycle, participants, host controls."""

import secrets
from datetime import datetime

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


def _mark_meeting_ended(db: Session, meeting: Meeting, reason: str = "ended", now: datetime | None = None) -> None:
    """Transition a meeting to ended status and ensure left_at is set for all participants."""
    if now is None:
        now = utcnow()
    meeting.status = "ended"
    if not meeting.ended_at:
        meeting.ended_at = now
    if meeting.created_at and (not meeting.duration_minutes or meeting.duration_minutes == 0):
        duration = max(1, int((meeting.ended_at - meeting.created_at).total_seconds() / 60))
        meeting.duration_minutes = duration
    for p in meeting.participants:
        if p.left_at is None:
            p.left_at = now
    db.add(
        MeetingHistory(
            meeting_id=meeting.id,
            action=reason,
            timestamp=now,
        )
    )


def _has_active_host(meeting: Meeting) -> bool:
    """Return True if at least one participant is a host and currently in the meeting."""
    return any(p.is_host and p.left_at is None for p in meeting.participants)


def _sync_active_meeting_status(db: Session, meeting: Meeting, now: datetime | None = None) -> bool:
    """If meeting is active but has no active host present (and wasn't just created in last 45s without a host having left), end it."""
    if meeting.status != "active":
        return False
    if now is None:
        now = utcnow()
    has_host = _has_active_host(meeting)
    if not has_host:
        had_host_who_left = any(p.is_host and p.left_at is not None for p in meeting.participants)
        is_fresh = (not had_host_who_left) and meeting.created_at and (now - meeting.created_at).total_seconds() < 45
        if not is_fresh:
            _mark_meeting_ended(db, meeting, reason="ended:no_active_host", now=now)
            return True
    return False


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
            detail="Meetings cannot be scheduled in the past. Scheduled time must be in the future.",
        )
    host_name = current_user.display_name if current_user else HOST_NAME
    user_id = current_user.id if current_user else None
    created = create_meeting(
        db,
        title=payload.title,
        description=payload.description,
        scheduled_time=payload.scheduled_time,
        duration=payload.duration_minutes,
        base_url=_base_url(request),
        is_seed=False,
        user_id=user_id,
        host_name=host_name,
    )
    obj = db.scalar(select(Meeting).where(Meeting.meeting_id == created["meeting_id"]))
    if obj:
        return _output(obj, request)
    return MeetingOut(**created)


@router.get("/upcoming", response_model=list[MeetingOut])
def upcoming(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Return future scheduled meetings (not yet started).
    If the user is not logged in, returns an empty list.
    When authenticated, returns user's scheduled meetings plus seed demo meetings.
    """
    now = utcnow()

    # 1. Exactly 5 seed demo upcoming meetings (shown after authentication or fallback)
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

    # 2. User's own future scheduled meetings (or unauthenticated scheduled meetings)
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
    else:
        user_cond = (
            (Meeting.is_seed.is_(False) | Meeting.is_seed.is_(None))
            & (Meeting.user_id.is_(None))
        )

    user_upcoming = (
        db.scalars(
            select(Meeting)
            .where(
                user_cond,
                Meeting.status == "scheduled",
                Meeting.scheduled_time >= now,
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
    Return recent meetings for the logged-in user.
    If the user is not logged in, returns an empty list.
    When authenticated, returns user's meetings plus the 5 seed demo history meetings.
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

    # 2. Gather user's recent meetings (or unauthenticated meetings)
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
    else:
        user_cond = (
            (Meeting.is_seed.is_(False) | Meeting.is_seed.is_(None))
            & (Meeting.user_id.is_(None))
        )

    # Active meetings (only in progress if host is actively in the meeting!)
    active_candidates = (
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

    dirty = False
    active_user_meetings: list[Meeting] = []
    for m in active_candidates:
        if _sync_active_meeting_status(db, m, now=now):
            dirty = True
        else:
            active_user_meetings.append(m)

    if dirty:
        db.commit()

    # Ended meetings (past history)
    ended_user_meetings = (
        db.scalars(
            select(Meeting)
            .where(
                user_cond,
                Meeting.status == "ended",
            )
            .order_by(Meeting.ended_at.desc().nullslast(), Meeting.id.desc())
            .limit(50)
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
            extra_dirty = False
            for m in extra_meetings:
                if _sync_active_meeting_status(db, m, now=now):
                    extra_dirty = True
            if extra_dirty:
                db.commit()
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

    # Check if this participant is the meeting creator / owner:
    # - current_user matches meeting.user_id
    # - OR current_user display_name matches meeting.host_name (case-insensitive)
    # - OR joiner display_name matches meeting.host_name (case-insensitive)
    is_meeting_owner = False
    if current_user and meeting.user_id and meeting.user_id == current_user.id:
        is_meeting_owner = True
    elif current_user and meeting.host_name and current_user.display_name.strip().lower() == meeting.host_name.strip().lower():
        is_meeting_owner = True
    elif meeting.host_name and display_name_to_use.strip().lower() == meeting.host_name.strip().lower():
        # Joined with the host's name
        if not active_host or active_host.session_id == session_id:
            is_meeting_owner = True

    # Determine whether this participant is the host:
    # 1. If this participant is the meeting creator/owner, they are ALWAYS the host unconditionally!
    # 2. If payload explicitly asks is_host=True (e.g. host start action), grant host if available.
    # 3. If payload explicitly asks is_host=False, non-owner is participant.
    # 4. If an active host already exists with a different session_id, newcomer is not host.
    # 5. Otherwise, host if display_name matches host_name and no other active host exists.
    if is_meeting_owner:
        determined_is_host = True
    elif payload.is_host is True:
        determined_is_host = (not active_host or active_host.session_id == session_id)
    elif payload.is_host is False:
        determined_is_host = False
    elif active_host and active_host.session_id != session_id:
        determined_is_host = False
    else:
        name_matches_host = bool(
            meeting.host_name and
            display_name_to_use.strip().lower() == meeting.host_name.strip().lower()
        )
        determined_is_host = (not active_host or active_host.session_id == session_id) and name_matches_host

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
    # Protect existing active participants (especially the host) from having their session hijacked
    if existing and existing.left_at is None and (
        existing.is_host or
        (existing.display_name.strip().lower() != display_name_to_use.strip().lower())
    ):
        session_id = secrets.token_urlsafe(18)
        existing = None

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
    now = utcnow()
    participant.left_at = now
    db.add(
        MeetingHistory(
            meeting_id=meeting.id,
            action=f"left:{participant.display_name}",
            timestamp=now,
        )
    )

    if participant.is_host:
        other_host = db.scalar(
            select(Participant).where(
                Participant.meeting_id == meeting.id,
                Participant.is_host.is_(True),
                Participant.left_at.is_(None),
                Participant.id != participant.id,
            )
        )
        if not other_host:
            # Host has left and no other active host remains -> end meeting immediately
            _mark_meeting_ended(db, meeting, reason="ended:host_left", now=now)
    else:
        # Check if ANY active participants remain
        has_any_active = any(
            p.left_at is None and p.id != participant.id for p in meeting.participants
        )
        if not has_any_active:
            _mark_meeting_ended(db, meeting, reason="ended:all_left", now=now)

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
    _mark_meeting_ended(db, meeting, reason="ended:host_action", now=now)
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
