# FocusRoom

A polished, Zoom-inspired meeting workspace built with **Next.js 15**, **TypeScript**, **Tailwind CSS**, **Lucide React**, **FastAPI**, **SQLAlchemy 2.x**, **SQLite**, and **WebSocket signaling**.

![FocusRoom](https://img.shields.io/badge/Status-Production_Ready-22c55e)
![Next.js](https://img.shields.io/badge/Next.js-15.5-black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57)

---

## Features

### Dashboard
- Professional Zoom-inspired layout with sidebar navigation
- Time-aware greeting (morning/afternoon/evening)
- Three action cards: New Meeting, Join Meeting, Schedule
- Live **upcoming** and **recent** meeting lists from the backend
- Loading skeletons, error banners, and empty state illustrations
- Toast notifications for clipboard operations

### Instant Meeting
- One-click meeting creation with auto-generated 6-digit ID
- Collision-resistant ID generation with secure invite token
- Immediate redirect to meeting room as host
- Shareable invitation URL with meeting ID and token

### Join Meeting
- Join via meeting ID or full invitation URL
- Smart URL parsing (extracts ID from `?meeting=...` or `/meeting/...` paths)
- Display name prompt before entering
- Validates meeting existence and status (404 for missing, 409 for ended)
- Standalone `/join` page and inline modal from dashboard

### Schedule Meeting
- Form with title, description (optional), date, time, and duration
- Server-side validation rejects past scheduling times
- Standalone `/schedule` page and inline modal
- Scheduled meetings appear in upcoming list immediately after creation

### Meeting Room
- Dark-themed video conference canvas with participant tiles
- Real camera preview (getUserMedia) with mirror transform
- Real microphone permission handling
- Participant panel with live polling (5-second refresh)
- Copy invitation link directly from meeting room
- Host controls: **End Meeting** button (separate from Leave)
- Host controls: **Kick participant** (remove non-host participants)
- Responsive layout for desktop, tablet, and mobile

### Meeting Lifecycle
- Three states: `scheduled` → `active` → `ended`
- Joining a scheduled meeting auto-activates it
- Host can end meeting (marks all participants as left)
- Leave meeting without ending it (host can leave without destroying the room)
- End meeting is idempotent (safe to call multiple times)

---

## Prerequisites

- **Node.js** 18+ (recommended 20+)
- **Python** 3.11+
- **pip** (Python package manager)

---

## Quick Start

### 1. Backend

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

The API:
- Creates `backend/zoom_clone.db` automatically on first run
- Seeds 5 realistic demo meetings (3 upcoming, 2 ended) — only once
- Serves at `http://localhost:8000`
- Interactive API docs at `http://localhost:8000/docs`

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

### Environment Variables

#### Backend (`backend/.env.example`)
```env
DATABASE_URL=sqlite:///./zoom_clone.db
FRONTEND_URL=http://localhost:3000
STUN_SERVER=stun:stun.l.google.com:19302
```

#### Frontend (`frontend/.env.example`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Copy `.env.example` to `.env` (backend) or `.env.local` (frontend) to customize.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/meetings/instant` | Create and activate an instant meeting |
| `POST` | `/api/meetings/schedule` | Schedule a meeting for a future time |
| `GET` | `/api/meetings/upcoming` | List scheduled/active meetings |
| `GET` | `/api/meetings/recent` | List the 10 most recently ended meetings |
| `GET` | `/api/meetings/{meeting_id}` | Get meeting details by ID |
| `POST` | `/api/meetings/join` | Register a participant into a meeting |
| `POST` | `/api/meetings/{meeting_id}/leave` | Mark participant as left |
| `GET` | `/api/meetings/{meeting_id}/participants` | List active participants |
| `POST` | `/api/meetings/{meeting_id}/end` | End meeting, mark all participants left |
| `POST` | `/api/meetings/{meeting_id}/kick` | Host-only: remove a participant |
| `WS` | `/ws/meetings/{meeting_id}` | WebSocket signaling for WebRTC |

### Payload Examples

**Schedule a meeting:**
```json
{
  "title": "Design Review",
  "description": "Review the new onboarding flow",
  "scheduled_time": "2026-10-15T14:00:00",
  "duration_minutes": 45
}
```

**Join a meeting:**
```json
{
  "meeting_id": "482190",
  "display_name": "Jane Smith"
}
```

**Kick a participant (host only):**
```json
{
  "host_session_id": "abc123...",
  "participant_id": 7
}
```

---

## Architecture

```
zoom-clone/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI app, startup, WebSocket signaling
│   │   ├── database.py       # Engine, session factory, helpers
│   │   ├── models.py         # Meeting, Participant, MeetingHistory ORM
│   │   ├── schemas.py        # Pydantic request/response schemas
│   │   ├── services.py       # Business logic, ID generation, seeding
│   │   └── routers/
│   │       └── meetings.py   # All REST API endpoints
│   ├── tests/
│   │   └── test_meetings.py  # 20 comprehensive API tests
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── layout.tsx        # Root layout with metadata
│   │   ├── globals.css       # Complete design system
│   │   ├── page.tsx          # Dashboard (home)
│   │   ├── join/page.tsx     # Standalone join page
│   │   ├── schedule/page.tsx # Standalone schedule page
│   │   └── meeting/
│   │       └── [meetingId]/
│   │           └── page.tsx  # Meeting room
│   ├── components/
│   │   ├── Brand.tsx         # Logo component
│   │   ├── Sidebar.tsx       # Navigation sidebar
│   │   ├── Topbar.tsx        # Top bar with date
│   │   ├── MeetingCard.tsx   # Individual meeting card
│   │   ├── MeetingList.tsx   # Meeting list with states
│   │   ├── ScheduleModal.tsx # Schedule form dialog
│   │   ├── JoinModal.tsx     # Join form dialog
│   │   └── Toast.tsx         # Notification toast
│   ├── lib/
│   │   └── api.ts            # Typed API client
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
└── README.md
```

### Database Schema

```
┌──────────────────────┐     ┌──────────────────────┐
│      meetings        │     │    participants       │
├──────────────────────┤     ├──────────────────────┤
│ id (PK)              │──┐  │ id (PK)              │
│ meeting_id (unique)  │  │  │ meeting_id (FK) ─────┤
│ invite_token (unique)│  │  │ display_name         │
│ title                │  │  │ is_host              │
│ description          │  │  │ joined_at            │
│ host_name            │  │  │ left_at              │
│ scheduled_time       │  │  │ session_id (unique)  │
│ duration_minutes     │  │  └──────────────────────┘
│ status               │  │
│ created_at           │  │  ┌──────────────────────┐
│ ended_at             │  │  │  meeting_history      │
└──────────────────────┘  │  ├──────────────────────┤
                          │  │ id (PK)              │
                          └──│ meeting_id (FK) ─────┤
                             │ action               │
                             │ timestamp            │
                             └──────────────────────┘
```

- **Foreign keys** with `CASCADE` delete
- **Indexes** on meeting_id, invite_token, status+scheduled_time, participant.meeting_id
- **UTC timestamps** (naive datetime, stored without timezone)

---

## Testing

### Backend Tests (20 tests)

```powershell
cd backend
python -m pytest tests/ -v
```

Test coverage includes:
- Instant meeting creation with unique IDs
- Schedule meeting with future time validation
- Reject past times and short titles
- Join active/ended/nonexistent meetings
- Participant registration and listing
- Leave meeting and invalid session handling
- End meeting (idempotent, marks all participants left)
- Full create→join→leave→end lifecycle
- Meeting details retrieval
- Health check

### Frontend Build Check

```powershell
cd frontend
npm run build
```

---

## Design Decisions

### Authentication
Authentication is intentionally **not implemented** for this assignment. The default host identity is `Alex Morgan`. A display-name match determines host status during join — this is **not** secure authorization and should be replaced by real authentication (OAuth, JWT, etc.) in production. The `host_session_id` check in the kick endpoint is an honor-system guard, not real auth.

### WebSocket Signaling
The WebSocket server at `/ws/meetings/{meeting_id}` implements proper multi-peer room management:
- **join**: Registers a peer, notifies existing peers, sends existing peer list
- **offer/answer/candidate**: Forwards WebRTC signaling to target peers
- **leave**: Removes peer and notifies others
- Auto-cleanup on disconnect

This is the signaling layer for WebRTC. Actual peer-to-peer audio/video requires both peers to complete the WebRTC negotiation. The current implementation provides local camera/microphone preview and the signaling infrastructure for multi-peer connections.

### Media
- **Camera**: Real `getUserMedia` with 720p video, mirrored preview
- **Microphone**: Real permission request and stream management
- **WebRTC peer-to-peer transmission**: The signaling server is implemented and ready. Full multi-peer WebRTC negotiation (creating RTCPeerConnection, exchanging offers/answers/candidates) would require additional client-side code. The current UI honestly shows local camera/mic state rather than claiming full video transmission.
- **Screen sharing**: Not implemented
- **Remote mute**: Not implemented

### Database
SQLite is used for simplicity. The seed function is idempotent — it only inserts demo data when the meetings table is empty. The database file persists across restarts.

---

## Known Limitations

1. **No real authentication** — host identity is based on display name matching
2. **Full WebRTC peer-to-peer video** — signaling server is ready, client-side RTCPeerConnection negotiation not yet wired
3. **Screen sharing** — not implemented
4. **Remote mute / force mute** — not implemented (UI buttons exist for local mute only)
5. **Mobile sidebar** — hidden on mobile, no hamburger menu drawer
6. **No meeting recording** — not implemented
7. **Test database isolation** — backend tests use the same database; running tests while the server is up may add test data

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + Custom CSS |
| Icons | Lucide React |
| Backend Framework | FastAPI |
| ORM | SQLAlchemy 2.x |
| Database | SQLite |
| Validation | Pydantic v2 |
| Real-time | WebSocket (FastAPI native) |
| Media | WebRTC (getUserMedia) |
| Testing | pytest + FastAPI TestClient |
