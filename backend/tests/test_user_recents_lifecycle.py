"""Test instant meeting lifecycle, user-scoped recents/upcoming, and host end-for-all."""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import User, Meeting, Participant
from app.database import SessionLocal, utcnow
from app.auth import create_access_token, hash_password

@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c

def create_user(email: str, name: str) -> tuple[int, str]:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                password_hash=hash_password("pass123"),
                display_name=name,
                created_at=utcnow(),
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        token = create_access_token({"sub": str(user.id), "email": user.email, "name": user.display_name})
        return user.id, token
    finally:
        db.close()

def test_instant_meeting_and_user_scoped_recents(client):
    host_id, host_token = create_user("host_alice@example.com", "Alice Host")
    part_id, part_token = create_user("part_bob@example.com", "Bob Participant")
    other_id, other_token = create_user("other_charlie@example.com", "Charlie Other")

    host_headers = {"Authorization": f"Bearer {host_token}"}
    part_headers = {"Authorization": f"Bearer {part_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}

    # 1. Host creates instant meeting
    res = client.post("/api/meetings/instant", headers=host_headers)
    assert res.status_code == 201
    meeting_data = res.json()
    mid = meeting_data["meeting_id"]
    assert meeting_data["title"] == "Instant meeting"
    assert meeting_data["status"] == "active"

    # Host joins
    join_host = client.post("/api/meetings/join", json={"meeting_id": mid, "display_name": "Alice Host"}, headers=host_headers).json()
    assert join_host["is_host"] is True

    # 2. Host checks recents: should contain this active instant meeting
    host_recent = client.get("/api/meetings/recent", headers=host_headers).json()
    host_found = [m for m in host_recent if m["meeting_id"] == mid]
    assert len(host_found) == 1
    assert host_found[0]["status"] == "active"
    assert host_found[0]["title"] == "Instant meeting"

    # 3. Bob (participant) has not joined yet -> should NOT see it in their recents
    part_recent_before = client.get("/api/meetings/recent", headers=part_headers).json()
    assert not any(m["meeting_id"] == mid for m in part_recent_before)

    # 4. Bob joins the meeting
    join_part = client.post("/api/meetings/join", json={"meeting_id": mid, "display_name": "Bob Participant"}, headers=part_headers).json()
    assert join_part["is_host"] is False

    # Bob leaves the meeting (host is still conducting!)
    client.post(f"/api/meetings/{mid}/leave", json={"session_id": join_part["session_id"]})

    # 5. Bob checks recents: should now contain this active meeting with status 'active' so Bob can rejoin!
    part_recent_after = client.get("/api/meetings/recent", headers=part_headers).json()
    part_found = [m for m in part_recent_after if m["meeting_id"] == mid]
    assert len(part_found) == 1
    assert part_found[0]["status"] == "active"

    # Bob rejoins the meeting from recents
    rejoin_part = client.post("/api/meetings/join", json={"meeting_id": mid, "display_name": "Bob Participant"}, headers=part_headers).json()
    assert rejoin_part["meeting"]["status"] == "active"

    # 6. Charlie (unrelated user) should NOT see this meeting in upcoming or recent
    charlie_recent = client.get("/api/meetings/recent", headers=other_headers).json()
    assert not any(m["meeting_id"] == mid for m in charlie_recent)
    charlie_upcoming = client.get("/api/meetings/upcoming", headers=other_headers).json()
    assert not any(m["meeting_id"] == mid for m in charlie_upcoming)

    # 7. Host ends meeting for all
    end_res = client.post(f"/api/meetings/{mid}/end", headers=host_headers)
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "ended"

    # 8. Both Alice and Bob now see it as 'ended' in recents, and cannot rejoin
    host_recent_ended = client.get("/api/meetings/recent", headers=host_headers).json()
    assert [m for m in host_recent_ended if m["meeting_id"] == mid][0]["status"] == "ended"

    part_recent_ended = client.get("/api/meetings/recent", headers=part_headers).json()
    assert [m for m in part_recent_ended if m["meeting_id"] == mid][0]["status"] == "ended"

    # Trying to join ended meeting returns 409
    join_after_end = client.post("/api/meetings/join", json={"meeting_id": mid, "display_name": "Bob Participant"}, headers=part_headers)
    assert join_after_end.status_code == 409
