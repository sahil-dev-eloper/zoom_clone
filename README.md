# Zooom — Real-Time Video Conferencing Workspace

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![WebRTC](https://img.shields.io/badge/WebRTC-Peer--to--Peer-333333?logo=webrtc)](https://webrtc.org/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite)](https://sqlite.org/)

A full-stack, enterprise-grade video conferencing workspace inspired by Zoom. Built from scratch with modern technologies: **Next.js 15 (App Router)** on the client, **FastAPI** with native WebSockets on the server, a **decentralized WebRTC multi-peer mesh** for peer-to-peer audio/video streaming, and **SQLAlchemy 2.x** with **SQLite** for robust relational persistence.

---

## Table of Contents

- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [WebRTC & Signaling Protocol](#webrtc--signaling-protocol)
- [Database Schema & Models](#database-schema--models)
- [REST API Reference](#rest-api-reference)
- [Project Directory Structure](#project-directory-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Multi-Device Local Network Testing](#multi-device-local-network-testing)
- [Environment Configuration](#environment-configuration)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Deployment Guidelines](#deployment-guidelines)

---

## Key Features

### 1. User Authentication & Profile Management
- **Secure Registration & Login**: Email-based authentication backed by `bcrypt` password hashing and signed JWT (`HS256`) access tokens.
- **Session Persistence**: Automatic token validation and synchronization across browser tabs via custom event listeners and `localStorage`.
- **Preconfigured Demo Account**: One-click autofill for quick local evaluation (`sahil@example.com` / `sahil123`).
- **Profile Updates**: Ability to update display names, which automatically syncs with upcoming and in-progress meetings.

### 2. Workplace Dashboard
- **Time-Aware Context**: Adaptive greeting banner reflecting local morning, afternoon, or evening hours.
- **Quick Action Hub**: Prominent cards for **New Meeting** (instant room), **Join Meeting** (via code or URL), and **Schedule Meeting**.
- **Real-Time Meeting Tracking**:
  - **Upcoming Meetings**: Chronological list of scheduled and active rooms with status badges, durations, and host tags.
  - **Recent Meetings**: Historical ledger of finished meetings with accurate end times and record retention.
- **Empty States & Skeletons**: Smooth loading states, animated skeletons, and custom vector illustrations for zero-state dashboards.

### 3. Instant & Scheduled Meetings
- **Collision-Resistant Meeting IDs**: Auto-generated 6-digit numeric identifiers checked against existing records to prevent collisions.
- **Cryptographic Invite Tokens**: URL-safe security tokens accompanying each meeting to validate legitimate attendee links.
- **Future Scheduling Engine**: Schedule calls with start times, anticipated duration, meeting descriptions, and calendar validation that prevents past dates.
- **Host Ownership**: Meetings are linked to registered user accounts while still enabling seamless guest invitations.

### 4. Meeting Room Experience
- **Adaptive Video Mesh**: Dynamic multi-tile layout that scales effortlessly across single-user previews, 1-on-1 calls, and multi-participant grids.
- **Local Media Management**:
  - Live hardware stream acquisition using `navigator.mediaDevices.getUserMedia`.
  - Independent audio microphone mute/unmute and camera feed enable/disable toggles.
  - Mirrored camera preview for natural self-view.
- **Screen Sharing**: Native display capture using `navigator.mediaDevices.getDisplayMedia` with automatic track replacement and restoration back to the camera stream on stop.
- **Speaking Detection**: Audio analysis detects when a participant is speaking, rendering a visual glowing border around their tile.
- **Host Controls**:
  - **Mute All**: Host can trigger an instant broadcast that mutes all non-host participants in the room.
  - **Copy Invitation Link**: One-click clipboard copy of the full join URL pre-populated with meeting ID and invite token.
  - **End Meeting for All**: Terminating a call marks the meeting as ended in the database and broadcasts an end signal that redirects all connected attendees back to the dashboard.
  - **Participant Panel**: Real-time roster of attendees showing host badges and connection status.

---

## System Architecture

The application is structured into two decoupled, scalable tiers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 15 Frontend                      │
│                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │ Dashboard Page │  │  Meeting Room  │  │  Auth / Join  │  │
│  └───────┬────────┘  └───────┬────────┘  └───────┬───────┘  │
│          │                   │                   │          │
│          │ REST (Fetch)      │ WebRTC (P2P)      │ REST     │
└──────────┼───────────────────┼───────────────────┼──────────┘
           │                   │                   │
           │ HTTP (JSON)       │ Audio/Video Mesh  │ HTTP
           ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                        │
│                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │  REST Routers  │  │ Signaling Hub  │  │  Auth Engine  │  │
│  │ (Meetings/Rec) │  │  (WebSockets)  │  │ (JWT/Bcrypt)  │  │
│  └───────┬────────┘  └───────┬────────┘  └───────┬───────┘  │
│          │                   │                   │          │
│          └───────────────────┼───────────────────┘          │
│                              ▼                              │
│                 SQLAlchemy 2.x ORM / SQLite                 │
│                     (backend/zoom_clone.db)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## WebRTC & Signaling Protocol

Peer-to-peer media communication operates over a full-mesh WebRTC topology. The FastAPI WebSocket server acts as the central signaling coordinator at `/ws/meetings/{meeting_id}`.

### Signaling Exchange Flow

1. **Room Registration (`join`)**:
   - New client opens WebSocket: `ws://localhost:8000/ws/meetings/{meeting_id}`.
   - Client sends: `{"type": "join", "peerId": "<uuid>", "displayName": "Sahil"}`.
   - Server returns existing peers: `{"type": "peers", "peerIds": ["<peer_1>", "<peer_2>"]}`.
   - Server broadcasts to existing peers: `{"type": "peer-joined", "peerId": "<uuid>", "displayName": "Sahil"}`.

2. **Offer / Answer Exchange (`offer`, `answer`)**:
   - For every existing peer in the room, the newcomer creates an `RTCPeerConnection`, adds local audio/video tracks, generates an SDP offer, and sends it targeted to that peer:
     ```json
     {
       "type": "offer",
       "targetPeerId": "<peer_1>",
       "peerId": "<newcomer>",
       "sdp": { ... }
     }
     ```
   - Target peer receives offer, sets remote description, creates an SDP answer, and routes it back:
     ```json
     {
       "type": "answer",
       "targetPeerId": "<newcomer>",
       "peerId": "<peer_1>",
       "sdp": { ... }
     }
     ```

3. **ICE Candidate Trickle (`candidate`)**:
   - As ICE candidates are gathered by browser network agents, they are forwarded directly to the target peer:
     ```json
     {
       "type": "candidate",
       "targetPeerId": "<target>",
       "peerId": "<sender>",
       "candidate": { ... }
     }
     ```

4. **Media State & Speaking Indicator (`media-state`, `speaking`)**:
   - Micro-state updates (video muted, audio muted) and audio level threshold events broadcast to all room peers to synchronize avatar placeholders and speaking highlights.

5. **Host Broadcast Actions (`mute-all`, `meeting-ended`)**:
   - **`mute-all`**: Broadcast to all peers; non-hosts immediately mute their local microphone tracks.
   - **`meeting-ended`**: Broadcast when the host terminates the call; all participants automatically close connections and redirect to the dashboard.

---

## Database Schema & Models

Zooom uses **SQLAlchemy 2.x** with absolute database binding in `backend/app/database.py` targeting `backend/zoom_clone.db`.

```
┌───────────────────────────────────────┐
│                 users                 │
├───────────────────────────────────────┤
│ id: Integer (PK, Autoincrement)       │
│ email: String (Unique, Indexed)       │
│ password_hash: String                 │
│ display_name: String                  │
│ created_at: DateTime                  │
└──────────────────┬────────────────────┘
                   │ 1:N
                   ▼
┌───────────────────────────────────────┐       ┌───────────────────────────────────────┐
│               meetings                │  1:N  │             participants              │
├───────────────────────────────────────┤───────▶├───────────────────────────────────────┤
│ id: Integer (PK, Autoincrement)       │       │ id: Integer (PK, Autoincrement)       │
│ meeting_id: String (Unique, Indexed)  │       │ meeting_id: Integer (FK -> meetings)  │
│ invite_token: String (Unique, Indexed)│       │ user_id: Integer (FK -> users, Null)  │
│ user_id: Integer (FK -> users, Null)  │       │ display_name: String                  │
│ title: String                         │       │ session_id: String (Unique, Indexed)  │
│ description: Text (Optional)          │       │ is_host: Boolean                      │
│ host_name: String                     │       │ joined_at: DateTime                   │
│ scheduled_time: DateTime (Indexed)    │       │ left_at: DateTime (Null until leave)  │
│ duration_minutes: Integer             │       └───────────────────────────────────────┘
│ status: String ("scheduled"|"active") │
│ is_seed: Boolean                      │       ┌───────────────────────────────────────┐
│ created_at: DateTime                  │  1:N  │            meeting_history            │
│ ended_at: DateTime (Null until end)   │───────▶├───────────────────────────────────────┤
└───────────────────────────────────────┘       │ id: Integer (PK, Autoincrement)       │
                                                │ meeting_id: Integer (FK -> meetings)  │
                                                │ action: String                        │
                                                │ timestamp: DateTime                   │
                                                └───────────────────────────────────────┘
```

---

## REST API Reference

All requests accept and return `application/json`. Authenticated routes require an `Authorization: Bearer <token>` header.

### Authentication Endpoints

| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/auth/register` | Register new account (`email`, `password`, `display_name`) | No |
| `POST` | `/api/auth/login` | Authenticate with credentials, returns JWT token | No |
| `GET` | `/api/auth/me` | Fetch authenticated user profile | Yes |
| `PUT` | `/api/auth/profile` | Update profile information (`display_name`) | Yes |

### Meeting Lifecycle Endpoints

| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/meetings/instant` | Generate and start an instant meeting | Optional |
| `POST` | `/api/meetings/schedule` | Schedule a future call with date, duration & title | Optional |
| `GET` | `/api/meetings/upcoming` | Retrieve scheduled & active meetings | Optional |
| `GET` | `/api/meetings/recent` | Retrieve recently concluded meetings | Optional |
| `GET` | `/api/meetings/{id}` | Get meeting metadata by meeting ID | No |
| `POST` | `/api/meetings/join` | Join a meeting session, registers participant | No |
| `POST` | `/api/meetings/{id}/leave` | Mark participant session as left | No |
| `POST` | `/api/meetings/{id}/end` | End meeting for all attendees (host action) | Optional |
| `GET` | `/api/meetings/{id}/participants`| Fetch active participants in meeting | No |
| `POST` | `/api/meetings/{id}/kick` | Remove attendee from meeting (host only) | Optional |

### Infrastructure & Signaling

| Method | Route | Description | Auth Required |
|---|---|---|:---:|
| `GET` | `/api/ice-servers` | Get configured STUN and TURN ICE servers for WebRTC | No |
| `GET` | `/health` | Server health check endpoint | No |
| `WS` | `/ws/meetings/{id}` | WebSocket connection for real-time WebRTC signaling | No |

---

## Project Directory Structure

```
zoom-clone/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── auth.py              # JWT encoding/decoding, bcrypt password hashing
│   │   ├── database.py          # SQLAlchemy engine, session factory & path resolution
│   │   ├── main.py              # FastAPI app, lifespan setup & WebSocket signaling
│   │   ├── models.py            # Declarative SQLAlchemy models (User, Meeting, etc.)
│   │   ├── schemas.py           # Pydantic v2 validation models
│   │   ├── services.py          # Meeting lifecycle logic & demo data seeders
│   │   └── routers/
│   │       ├── auth.py          # /api/auth registration, login & profile endpoints
│   │       └── meetings.py      # /api/meetings lifecycle & participant endpoints
│   ├── tests/
│   │   ├── test_meetings.py     # Meeting lifecycle test suite
│   │   └── test_user_recents_lifecycle.py # User recent meetings validation
│   ├── requirements.txt         # Python dependencies
│   ├── .env.example             # Template backend environment configuration
│   └── zoom_clone.db            # Canonical SQLite database file
│
├── frontend/
│   ├── app/
│   │   ├── globals.css          # Core CSS variables, typography & layout styles
│   │   ├── layout.tsx           # Root layout with metadata and styling wrapper
│   │   ├── page.tsx             # Main dashboard (upcoming/recent meetings, actions)
│   │   ├── join/page.tsx        # Standalone join meeting page
│   │   ├── login/page.tsx       # Authentication page (Sign In / Register / Demo)
│   │   ├── schedule/page.tsx    # Standalone meeting scheduling page
│   │   └── meeting/[meetingId]/
│   │       └── page.tsx         # Video conference room (WebRTC, grid, controls)
│   ├── components/
│   │   ├── Brand.tsx            # Zoom Workplace logo badge
│   │   ├── Sidebar.tsx          # Desktop navigation sidebar
│   │   ├── Topbar.tsx           # Header bar with time and user profile avatar
│   │   ├── MeetingCard.tsx      # Meeting card component with status pill & actions
│   │   ├── MeetingList.tsx      # Container list for upcoming and recent meetings
│   │   ├── JoinModal.tsx        # Modal dialogue for joining via ID or link
│   │   ├── ScheduleModal.tsx    # Modal dialogue for scheduling meetings
│   │   ├── Toast.tsx            # Clipboard and action toast notification
│   │   └── zoom/                # Dedicated workspace views (Settings, Chat, Nav)
│   ├── lib/
│   │   ├── api.ts               # Typed API client, host detection & WebSocket factory
│   │   └── auth.ts              # React useAuth hook, storage sync & token management
│   ├── types/
│   │   └── index.ts             # TypeScript interfaces for API models & WebRTC states
│   ├── package.json             # Frontend dependencies & scripts
│   ├── tsconfig.json            # TypeScript configuration
│   └── .env.example             # Template frontend environment configuration
│
└── README.md                    # Comprehensive project documentation
```

---

## Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: v18.17+ or v20+
- **Python**: v3.11+
- **npm** or **pnpm**
- **pip** (Python package installer)

---

### Backend Setup

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```

2. (Recommended) Create and activate a Python virtual environment:
   ```bash
   # Windows (PowerShell)
   python -m venv .venv
   .venv\Scripts\Activate.ps1

   # macOS / Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

4. Create your local environment configuration:
   ```bash
   cp .env.example .env
   ```

5. Launch the FastAPI development server:
   ```bash
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

   - API will be accessible at: `http://localhost:8000`
   - Interactive OpenAPI documentation: `http://localhost:8000/docs`
   - SQLite database (`zoom_clone.db`) will initialize and seed demo meetings automatically.

---

### Frontend Setup

1. Open a second terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your local environment configuration:
   ```bash
   cp .env.example .env
   ```

4. Launch the Next.js development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

### Multi-Device Local Network Testing

To test real video and audio streaming across multiple devices (e.g., your laptop, desktop, or mobile phone on the same Wi-Fi network):

1. **Find your computer's local IP address**:
   - Windows: Run `ipconfig` (look for *IPv4 Address*, e.g., `192.168.1.15`).
   - macOS / Linux: Run `ifconfig` or `ip a` (e.g., `192.168.1.15`).

2. **Access from other devices**:
   - On the second device, open the browser and visit `http://192.168.1.15:3000`.
   - The application automatically detects that it is being accessed over a local network (`192.168.x.x` or `10.x.x.x`) and routes API and WebSocket requests directly to `http://192.168.1.15:8000`.
   - Both devices will negotiate direct WebRTC peer connections with full audio, video, and screen sharing.

---

## Environment Configuration

### Backend (`backend/.env`)

| Variable | Default Value | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./zoom_clone.db` | SQLAlchemy connection string. Canonical database resolves to `backend/zoom_clone.db`. |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend origin for CORS and join redirects. |
| `JWT_SECRET` | `zoom_workplace_secret_key_...`| Secret key used to sign and verify JWT tokens. |
| `STUN_SERVER` | `stun:stun.l.google.com:19302` | Public STUN server for ICE candidate discovery. |
| `TURN_SERVER` | *(Optional)* | TURN server URI for symmetric NAT / corporate firewall traversal. |
| `TURN_USERNAME` | *(Optional)* | Authentication username for TURN relay. |
| `TURN_CREDENTIAL` | *(Optional)* | Password/credential for TURN relay. |

### Frontend (`frontend/.env`)

| Variable | Default Value | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API base URL. |
| `NEXT_PUBLIC_WS_URL` | *(Derived)* | Custom WebSocket signaling URL (defaults automatically to `ws://` or `wss://` based on API URL). |

---

## Testing & Quality Assurance

### Run Backend Test Suite

Execute the `pytest` suite from the `backend/` directory:

```bash
cd backend
python -m pytest tests/ -v
```

The test suite covers:
- User registration, duplicate email rejection, and password verification.
- JWT token generation, header verification, and profile endpoints.
- Instant meeting creation, ID uniqueness, and invite token generation.
- Future scheduling validation and past date rejection.
- Joining flows, participant tracking, leave triggers, and host termination.

### Validate Frontend Production Build

Run the Next.js compiler and linter:

```bash
cd frontend
npm run build
```

---

## Deployment Guidelines

### 1. Frontend on Vercel
- Connect your GitHub repository to [Vercel](https://vercel.com).
- Set **Root Directory** to `frontend`.
- Set Environment Variables:
  - `NEXT_PUBLIC_API_URL`: Your deployed backend URL (e.g. `https://your-api.onrender.com`).
- Deploy. Vercel automatically configures edge routing and static optimization.

### 2. Backend on Render / Railway / Fly.io
- Deploy the `backend/` folder using Python 3.11+.
- **Start Command**:
  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```
- **Persistent Disk**: If deploying SQLite on a container platform (such as Render or Fly.io), attach a persistent disk volume to ensure the database file (`zoom_clone.db`) persists across deployments.
- Set Environment Variables:
  - `FRONTEND_URL`: Your deployed frontend URL (e.g., `https://your-app.vercel.app`).
  - `JWT_SECRET`: A long, randomly generated secret string.
  - `DATABASE_URL`: `sqlite:////data/zoom_clone.db` (pointing to your persistent disk mount) or PostgreSQL connection string.
