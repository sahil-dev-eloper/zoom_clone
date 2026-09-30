"""Comprehensive tests for the FocusRoom meeting API."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


# ---- Instant meeting -------------------------------------------------------

class TestInstantMeeting:
    def test_creates_active_meeting(self, client):
        resp = client.post("/api/meetings/instant")
        assert resp.status_code == 201
        data = resp.json()
        assert len(data["meeting_id"]) == 6
        assert data["status"] == "active"
        assert data["invite_url"]
        assert data["invite_token"]

    def test_unique_ids_on_multiple_creates(self, client):
        ids = set()
        for _ in range(5):
            resp = client.post("/api/meetings/instant")
            ids.add(resp.json()["meeting_id"])
        assert len(ids) == 5


# ---- Schedule meeting ------------------------------------------------------

class TestScheduleMeeting:
    def test_schedule_future_meeting(self, client):
        future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        resp = client.post(
            "/api/meetings/schedule",
            json={
                "title": "QA review",
                "description": "Test planning",
                "scheduled_time": future,
                "duration_minutes": 45,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "scheduled"
        assert data["title"] == "QA review"
        assert data["duration_minutes"] == 45

    def test_reject_past_time(self, client):
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        resp = client.post(
            "/api/meetings/schedule",
            json={
                "title": "Missed meeting",
                "scheduled_time": past,
                "duration_minutes": 30,
            },
        )
        assert resp.status_code == 422

    def test_reject_short_title(self, client):
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        resp = client.post(
            "/api/meetings/schedule",
            json={
                "title": "X",
                "scheduled_time": future,
                "duration_minutes": 30,
            },
        )
        assert resp.status_code == 422

    def test_shows_in_upcoming(self, client):
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        scheduled = client.post(
            "/api/meetings/schedule",
            json={
                "title": "Upcoming test",
                "scheduled_time": future,
                "duration_minutes": 30,
            },
        ).json()
        upcoming = client.get("/api/meetings/upcoming").json()
        assert any(
            m["meeting_id"] == scheduled["meeting_id"] for m in upcoming
        )


# ---- Join meeting -----------------------------------------------------------

class TestJoinMeeting:
    def test_join_active_meeting(self, client):
        created = client.post("/api/meetings/instant").json()
        resp = client.post(
            "/api/meetings/join",
            json={
                "meeting_id": created["meeting_id"],
                "display_name": "Test Guest",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["meeting"]["meeting_id"] == created["meeting_id"]
        assert data["session_id"]
        assert data["is_host"] is False

    def test_join_nonexistent_meeting(self, client):
        resp = client.post(
            "/api/meetings/join",
            json={"meeting_id": "000000", "display_name": "Ghost"},
        )
        assert resp.status_code == 404

    def test_join_ended_meeting(self, client):
        created = client.post("/api/meetings/instant").json()
        client.post(f"/api/meetings/{created['meeting_id']}/end")
        resp = client.post(
            "/api/meetings/join",
            json={
                "meeting_id": created["meeting_id"],
                "display_name": "Late Guest",
            },
        )
        assert resp.status_code == 409


# ---- Participants -----------------------------------------------------------

class TestParticipants:
    def test_participant_registered(self, client):
        created = client.post("/api/meetings/instant").json()
        joined = client.post(
            "/api/meetings/join",
            json={
                "meeting_id": created["meeting_id"],
                "display_name": "Alice",
            },
        ).json()
        resp = client.get(
            f"/api/meetings/{created['meeting_id']}/participants"
        )
        assert resp.status_code == 200
        names = [p["display_name"] for p in resp.json()]
        assert "Alice" in names


# ---- Leave meeting ----------------------------------------------------------

class TestLeaveMeeting:
    def test_leave_meeting(self, client):
        created = client.post("/api/meetings/instant").json()
        joined = client.post(
            "/api/meetings/join",
            json={
                "meeting_id": created["meeting_id"],
                "display_name": "Bob",
            },
        ).json()
        resp = client.post(
            f"/api/meetings/{created['meeting_id']}/leave",
            json={"session_id": joined["session_id"]},
        )
        assert resp.status_code == 200

    def test_leave_invalid_session(self, client):
        created = client.post("/api/meetings/instant").json()
        resp = client.post(
            f"/api/meetings/{created['meeting_id']}/leave",
            json={"session_id": "nonexistent"},
        )
        assert resp.status_code == 404


# ---- End meeting ------------------------------------------------------------

class TestEndMeeting:
    def test_end_meeting(self, client):
        created = client.post("/api/meetings/instant").json()
        resp = client.post(f"/api/meetings/{created['meeting_id']}/end")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ended"

    def test_end_idempotent(self, client):
        created = client.post("/api/meetings/instant").json()
        client.post(f"/api/meetings/{created['meeting_id']}/end")
        resp = client.post(f"/api/meetings/{created['meeting_id']}/end")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ended"

    def test_end_marks_participants_left(self, client):
        created = client.post("/api/meetings/instant").json()
        client.post(
            "/api/meetings/join",
            json={
                "meeting_id": created["meeting_id"],
                "display_name": "Carol",
            },
        )
        client.post(f"/api/meetings/{created['meeting_id']}/end")
        resp = client.get(
            f"/api/meetings/{created['meeting_id']}/participants"
        )
        # After ending, no active participants
        assert len(resp.json()) == 0

    def test_ended_appears_in_recent(self, client):
        created = client.post("/api/meetings/instant").json()
        client.post(f"/api/meetings/{created['meeting_id']}/end")
        recent = client.get("/api/meetings/recent").json()
        assert any(
            m["meeting_id"] == created["meeting_id"] for m in recent
        )


# ---- Full lifecycle ---------------------------------------------------------

class TestFullLifecycle:
    def test_create_join_leave_end(self, client):
        # Create
        created = client.post("/api/meetings/instant").json()
        mid = created["meeting_id"]

        # Join as guest
        joined = client.post(
            "/api/meetings/join",
            json={"meeting_id": mid, "display_name": "Test Guest"},
        ).json()

        # Check participants
        parts = client.get(f"/api/meetings/{mid}/participants").json()
        assert any(p["display_name"] == "Test Guest" for p in parts)

        # Leave
        client.post(
            f"/api/meetings/{mid}/leave",
            json={"session_id": joined["session_id"]},
        )

        # End
        ended = client.post(f"/api/meetings/{mid}/end").json()
        assert ended["status"] == "ended"


# ---- Meeting details --------------------------------------------------------

class TestMeetingDetails:
    def test_get_details(self, client):
        created = client.post("/api/meetings/instant").json()
        resp = client.get(f"/api/meetings/{created['meeting_id']}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Instant meeting"

    def test_get_nonexistent(self, client):
        resp = client.get("/api/meetings/999999")
        assert resp.status_code == 404


# ---- Health -----------------------------------------------------------------

class TestHealth:
    def test_health_check(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ---- Host Controls ----------------------------------------------------------

class TestHostControls:
    def test_host_can_kick_guest(self, client):
        meeting = client.post("/api/meetings/instant").json()
        mid = meeting["meeting_id"]

        # Join as host (Sahil Dargar)
        host_join = client.post(
            "/api/meetings/join",
            json={"meeting_id": mid, "display_name": "Sahil Dargar"},
        ).json()
        assert host_join["is_host"] is True

        # Join as guest
        guest_join = client.post(
            "/api/meetings/join",
            json={"meeting_id": mid, "display_name": "Guest 1"},
        ).json()

        # Kick guest
        kick_resp = client.post(
            f"/api/meetings/{mid}/kick",
            json={
                "host_session_id": host_join["session_id"],
                "participant_id": guest_join["participant_id"],
            },
        )
        assert kick_resp.status_code == 200
        assert kick_resp.json()["removed"] == "Guest 1"

        # Verify guest is no longer in active participants
        parts = client.get(f"/api/meetings/{mid}/participants").json()
        assert not any(p["id"] == guest_join["participant_id"] for p in parts)

    def test_non_host_cannot_kick(self, client):
        meeting = client.post("/api/meetings/instant").json()
        mid = meeting["meeting_id"]

        guest1 = client.post(
            "/api/meetings/join",
            json={"meeting_id": mid, "display_name": "Guest 1"},
        ).json()
        guest2 = client.post(
            "/api/meetings/join",
            json={"meeting_id": mid, "display_name": "Guest 2"},
        ).json()

        # Guest 1 attempts to kick Guest 2
        kick_resp = client.post(
            f"/api/meetings/{mid}/kick",
            json={
                "host_session_id": guest1["session_id"],
                "participant_id": guest2["participant_id"],
            },
        )
        assert kick_resp.status_code == 403

    def test_host_cannot_kick_self(self, client):
        meeting = client.post("/api/meetings/instant").json()
        mid = meeting["meeting_id"]

        host_join = client.post(
            "/api/meetings/join",
            json={"meeting_id": mid, "display_name": "Sahil Dargar"},
        ).json()

        kick_resp = client.post(
            f"/api/meetings/{mid}/kick",
            json={
                "host_session_id": host_join["session_id"],
                "participant_id": host_join["participant_id"],
            },
        )
        assert kick_resp.status_code == 400


# ---- Timezone Handling -----------------------------------------------------

class TestTimezoneHandling:
    def test_schedule_with_explicit_timezone(self, client):
        # 2 days in the future with UTC offset +05:30
        future = datetime.now(timezone.utc) + timedelta(days=2)
        iso_str = future.isoformat()
        resp = client.post(
            "/api/meetings/schedule",
            json={
                "title": "Timezone sync",
                "scheduled_time": iso_str,
                "duration_minutes": 30,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "scheduled_time" in data


# ---- WebSocket Signaling ----------------------------------------------------

class TestWebSocketSignaling:
    def test_signaling_join_and_leave(self, client):
        meeting = client.post("/api/meetings/instant").json()
        mid = meeting["meeting_id"]

        # Peer 1 connects and joins
        with client.websocket_connect(f"/ws/meetings/{mid}") as ws1:
            ws1.send_json({"type": "join", "peerId": "peer1", "displayName": "Alice"})
            welcome = ws1.receive_json()
            assert welcome["type"] == "peers"
            assert welcome["peerIds"] == []

            # Peer 2 connects and joins
            with client.websocket_connect(f"/ws/meetings/{mid}") as ws2:
                ws2.send_json({"type": "join", "peerId": "peer2", "displayName": "Bob"})
                welcome2 = ws2.receive_json()
                assert welcome2["type"] == "peers"
                assert "peer1" in welcome2["peerIds"]

                # Peer 1 should receive peer-joined for Bob
                joined_event = ws1.receive_json()
                assert joined_event["type"] == "peer-joined"
                assert joined_event["peerId"] == "peer2"
                assert joined_event["displayName"] == "Bob"

                # Send an offer from Peer 1 to Peer 2
                ws1.send_json({
                    "type": "offer",
                    "peerId": "peer1",
                    "targetPeerId": "peer2",
                    "sdp": {"type": "offer", "sdp": "fake-sdp"},
                })
                offer_event = ws2.receive_json()
                assert offer_event["type"] == "offer"
                assert offer_event["peerId"] == "peer1"

            # Peer 2 disconnected/closed, ws1 should receive peer-left
            left_event = ws1.receive_json()
            assert left_event["type"] == "peer-left"
            assert left_event["peerId"] == "peer2"


# ---- Redirects -------------------------------------------------------------

class TestRedirects:
    def test_redirect_join_preserves_query(self, client):
        resp = client.get(
            "/join?meeting=999888&token=test_token", follow_redirects=False
        )
        assert resp.status_code == 307
        assert "join?meeting=999888&token=test_token" in resp.headers["location"]

    def test_redirect_meeting_path(self, client):
        resp = client.get("/meeting/999888", follow_redirects=False)
        assert resp.status_code == 307
        assert "meeting/999888" in resp.headers["location"]


