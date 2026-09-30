"""
FocusRoom API — FastAPI application entry point.

Provides REST endpoints for meeting lifecycle management and a WebSocket
signaling server for WebRTC peer negotiation.
"""

from __future__ import annotations

import json
import logging
import os
from collections import defaultdict

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .routers.meetings import router
from .services import get_frontend_base, record_frontend_origin, seed_meetings

from contextlib import asynccontextmanager

logger = logging.getLogger("zooom.signaling")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# App & middleware
# ---------------------------------------------------------------------------

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables and seed demo data on first run."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_meetings(db, FRONTEND_URL)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Zooom API",
    version="1.0.0",
    description="Backend API for the Zooom meeting workspace.",
    lifespan=lifespan,
)

origins = [
    FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if FRONTEND_URL and FRONTEND_URL not in origins:
    origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def track_frontend_origin_middleware(request: Request, call_next):
    record_frontend_origin(request)
    return await call_next(request)


app.include_router(router)


@app.get("/")
def root():
    return {
        "name": "Zooom API",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "upcoming": "/api/meetings/upcoming",
            "recent": "/api/meetings/recent",
            "instant": "/api/meetings/instant",
            "schedule": "/api/meetings/schedule",
        },
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/ice-servers")
def ice_servers():
    """Return configured STUN and TURN ICE servers for WebRTC negotiation."""
    stun_server = os.getenv("STUN_SERVER", "stun:stun.l.google.com:19302")
    servers = [
        {
            "urls": [
                stun_server,
                "stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302",
                "stun:stun.cloudflare.com:3478",
            ]
        }
    ]
    turn_server = os.getenv("TURN_SERVER")
    turn_user = os.getenv("TURN_USERNAME")
    turn_credential = os.getenv("TURN_CREDENTIAL")
    if turn_server:
        turn_entry: dict = {"urls": [turn_server]}
        if turn_user:
            turn_entry["username"] = turn_user
        if turn_credential:
            turn_entry["credential"] = turn_credential
        servers.append(turn_entry)
    return {"iceServers": servers}


@app.get("/join")
def redirect_join(request: Request):
    from starlette.responses import RedirectResponse
    base = get_frontend_base(request)
    query = str(request.url.query)
    target = f"{base}/join"
    if query:
        target += f"?{query}"
    return RedirectResponse(url=target, status_code=307)


@app.get("/meeting/{meeting_id}")
def redirect_meeting(meeting_id: str, request: Request):
    from starlette.responses import RedirectResponse
    base = get_frontend_base(request)
    query = str(request.url.query)
    target = f"{base}/meeting/{meeting_id}"
    if query:
        target += f"?{query}"
    return RedirectResponse(url=target, status_code=307)


# ---------------------------------------------------------------------------
# WebSocket signaling for WebRTC
# ---------------------------------------------------------------------------

# Room → set of connected WebSocket clients
_rooms: dict[str, dict[str, WebSocket]] = defaultdict(dict)


@app.websocket("/ws/meetings/{meeting_id}")
async def signaling(websocket: WebSocket, meeting_id: str):
    """
    Multi-peer signaling relay.

    Each client sends JSON messages with at least a "type" field. The server
    broadcasts to all other peers in the same meeting room.
    """
    await websocket.accept()
    peer_id: str | None = None
    logger.info(f"[Signaling] Client connected to room {meeting_id}")

    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            msg_type = message.get("type")
            peer_id = message.get("peerId", peer_id)

            if msg_type == "join" and peer_id:
                # Register in the room
                _rooms[meeting_id][peer_id] = websocket
                display_name = message.get("displayName", "Guest")

                # Tell the newcomer about existing peers
                existing = [
                    pid for pid in _rooms[meeting_id] if pid != peer_id
                ]
                logger.info(
                    f"[Signaling] Peer {peer_id} ({display_name}) registered in room {meeting_id}. "
                    f"Existing peers: {existing}"
                )
                await websocket.send_json(
                    {"type": "peers", "peerIds": existing}
                )

                # Tell existing peers about the newcomer
                for pid, ws in _rooms[meeting_id].items():
                    if pid != peer_id:
                        try:
                            await ws.send_json(
                                {
                                    "type": "peer-joined",
                                    "peerId": peer_id,
                                    "displayName": display_name,
                                }
                            )
                        except Exception as e:
                            logger.warning(f"[Signaling] Failed to send peer-joined to {pid}: {e}")

            elif msg_type in ("offer", "answer", "candidate", "media-state", "speaking"):
                target = message.get("targetPeerId")
                if target and target in _rooms[meeting_id]:
                    try:
                        await _rooms[meeting_id][target].send_json(message)
                        logger.debug(
                            f"[Signaling] Relayed {msg_type} from {peer_id} to {target} in room {meeting_id}"
                        )
                    except Exception as e:
                        logger.warning(f"[Signaling] Error relaying {msg_type} to {target}: {e}")
                elif target and target not in _rooms[meeting_id]:
                    logger.debug(
                        f"[Signaling] Target peer {target} not currently in room {meeting_id} for {msg_type}"
                    )
                elif not target:
                    # Broadcast to all other peers in room
                    for pid, ws in _rooms[meeting_id].items():
                        if pid != peer_id:
                            try:
                                await ws.send_json(message)
                            except Exception as e:
                                logger.warning(f"[Signaling] Error broadcasting {msg_type} to {pid}: {e}")

            elif msg_type == "leave" and peer_id:
                logger.info(f"[Signaling] Peer {peer_id} sent leave for room {meeting_id}")
                _rooms[meeting_id].pop(peer_id, None)
                for pid, ws in _rooms[meeting_id].items():
                    try:
                        await ws.send_json(
                            {"type": "peer-left", "peerId": peer_id}
                        )
                    except Exception as e:
                        logger.warning(f"[Signaling] Error notifying peer-left to {pid}: {e}")

    except WebSocketDisconnect:
        logger.info(f"[Signaling] WebSocket disconnected for peer {peer_id} in room {meeting_id}")
    except Exception as exc:
        logger.warning(f"[Signaling] Unexpected error in room {meeting_id} for peer {peer_id}: {exc}")
    finally:
        # Clean up on disconnect
        if peer_id and meeting_id in _rooms:
            _rooms[meeting_id].pop(peer_id, None)
            for pid, ws in list(_rooms[meeting_id].items()):
                try:
                    await ws.send_json(
                        {"type": "peer-left", "peerId": peer_id}
                    )
                except Exception as e:
                    logger.warning(f"[Signaling] Error sending peer-left to {pid}: {e}")
            if not _rooms[meeting_id]:
                del _rooms[meeting_id]
