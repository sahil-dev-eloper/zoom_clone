"""
FocusRoom API — FastAPI application entry point.

Provides REST endpoints for meeting lifecycle management and a WebSocket
signaling server for WebRTC peer negotiation.
"""

from __future__ import annotations

import json
import os
from collections import defaultdict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .routers.meetings import router
from .services import seed_meetings

from contextlib import asynccontextmanager

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


# ---------------------------------------------------------------------------
# WebSocket signaling for WebRTC
# ---------------------------------------------------------------------------

# Room → set of connected WebSocket clients
_rooms: dict[str, dict[str, WebSocket]] = defaultdict(dict)


@app.websocket("/ws/meetings/{meeting_id}")
async def signaling(websocket: WebSocket, meeting_id: str):
    """
    Multi-peer signaling relay.

    Each client sends JSON messages with at least a "type" field.  The server
    broadcasts to all *other* peers in the same meeting room.

    Supported message types from clients:
      - join      : { type: "join", peerId, displayName }
      - offer     : { type: "offer", peerId, targetPeerId, sdp }
      - answer    : { type: "answer", peerId, targetPeerId, sdp }
      - candidate : { type: "candidate", peerId, targetPeerId, candidate }
      - leave     : { type: "leave", peerId }

    The server injects a "peers" message on join to inform the newcomer of
    existing peers.
    """
    await websocket.accept()
    peer_id: str | None = None

    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            msg_type = message.get("type")
            peer_id = message.get("peerId", peer_id)

            if msg_type == "join" and peer_id:
                # Register in the room
                _rooms[meeting_id][peer_id] = websocket

                # Tell the newcomer about existing peers
                existing = [
                    pid for pid in _rooms[meeting_id] if pid != peer_id
                ]
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
                                    "displayName": message.get(
                                        "displayName", "Guest"
                                    ),
                                }
                            )
                        except Exception:
                            pass

            elif msg_type in ("offer", "answer", "candidate", "media-state", "speaking"):
                # Forward to target peer or broadcast to all other peers in room
                target = message.get("targetPeerId")
                if target and target in _rooms[meeting_id]:
                    try:
                        await _rooms[meeting_id][target].send_json(message)
                    except Exception:
                        pass
                elif not target:
                    for pid, ws in _rooms[meeting_id].items():
                        if pid != peer_id:
                            try:
                                await ws.send_json(message)
                            except Exception:
                                pass

            elif msg_type == "leave" and peer_id:
                _rooms[meeting_id].pop(peer_id, None)
                for pid, ws in _rooms[meeting_id].items():
                    try:
                        await ws.send_json(
                            {"type": "peer-left", "peerId": peer_id}
                        )
                    except Exception:
                        pass

    except (WebSocketDisconnect, Exception):
        # Clean up on disconnect
        if peer_id and meeting_id in _rooms:
            _rooms[meeting_id].pop(peer_id, None)
            for pid, ws in list(_rooms[meeting_id].items()):
                try:
                    await ws.send_json(
                        {"type": "peer-left", "peerId": peer_id}
                    )
                except Exception:
                    pass
            if not _rooms[meeting_id]:
                del _rooms[meeting_id]
