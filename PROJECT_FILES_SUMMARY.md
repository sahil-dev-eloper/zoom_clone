# Project Files Summary: Zoom Clone

This document provides a concise 1–2 line overview of every file in the project, detailing its purpose and role within the architecture.

---

## 1. Root & Documentation

- **`.gitignore`**: Specifies untracked build artifacts, database files, virtual environments, and `node_modules` ignored by Git.
- **`DATABASE_DESIGN.md`**: Architectural document detailing the SQLite schema, table entities, relationships, and lifecycle statuses.
- **`PROJECT_KNOWLEDGE_BASE.md`**: Comprehensive developer guide covering architecture, WebRTC mesh signaling, authentication, and design systems.
- **`README.md`**: Project entry point providing setup instructions, prerequisites, running commands, and feature overview.

---

## 2. Backend (FastAPI, SQLite, WebRTC Signaling)

### Core Application
- **`backend/.env`**: Local environment configuration specifying the server secret key, database URL, and port settings.
- **`backend/.env.example`**: Example template of environment variables required to run the FastAPI backend.
- **`backend/requirements.txt`**: Python dependencies list containing FastAPI, Uvicorn, SQLAlchemy, WebSockets, PyJWT, and bcrypt.
- **`backend/zoom.db`**: Primary SQLite database storing users, meetings, participants, and lifecycle history audit logs.
- **`backend/app/__init__.py`**: Marks the `app` folder as a Python package and exposes application modules.
- **`backend/app/main.py`**: FastAPI entry point configuring CORS, mounting API routers, initializing DB seeds, and hosting the WebRTC WebSocket signaling server.
- **`backend/app/database.py`**: SQLAlchemy database engine, session factory (`SessionLocal`), declarative Base, and timezone-aware UTC datetime utilities.
- **`backend/app/models.py`**: SQLAlchemy ORM models for `User`, `Meeting`, `Participant`, and `MeetingHistory`.
- **`backend/app/schemas.py`**: Pydantic data schemas for request validation, responses, and token serialization.
- **`backend/app/services.py`**: Business logic for meeting code generation, invite URL formatting, seed meeting population, and origin resolution.
- **`backend/app/auth.py`**: JWT token creation, token decoding, password hashing, and FastAPI dependency authentication handlers.

### API Routers
- **`backend/app/routers/auth.py`**: Authentication endpoints for user registration (`/register`), login (`/login`), and current user profile (`/me`).
- **`backend/app/routers/meetings.py`**: Meeting lifecycle endpoints covering instant creation, scheduling, upcoming queries, dynamic recents cleanup, join, leave, end, and host kick actions.

### Tests & Utilities
- **`backend/scratch_test_signaling.py`**: Standalone diagnostic script for testing WebSocket connection and signaling broadcast behavior.
- **`backend/tests/test_meetings.py`**: Comprehensive pytest suite testing instant meetings, scheduling, participant tracking, and host controls.
- **`backend/tests/test_user_recents_lifecycle.py`**: Integration tests verifying user-scoped recents, host-leave auto-termination, and zombie meeting auto-cleanup.

---

## 3. Frontend (Next.js 15, React 19, TypeScript)

### Routing & Pages
- **`frontend/.env`**: Local frontend environment file defining the backend API URL (`NEXT_PUBLIC_API_URL`).
- **`frontend/.env.example`**: Template example of frontend environment variables for deployment and local development.
- **`frontend/app/layout.tsx`**: Root HTML layout embedding metadata, Inter font styles, and wrapping the application tree.
- **`frontend/app/globals.css`**: Design system stylesheet implementing Zoom desktop dark/light palettes, animations, and component styling.
- **`frontend/app/page.tsx`**: Primary Zoom Workplace dashboard integrating the navigation rail, top header, home actions, and real-time meeting updates.
- **`frontend/app/join/page.tsx`**: Standalone web join page allowing participants to enter a meeting ID and display name to enter a call.
- **`frontend/app/login/page.tsx`**: Dedicated authentication page for logging in or creating a new user account.
- **`frontend/app/schedule/page.tsx`**: Dedicated scheduling page featuring title, date/time picker with past-date validation, and duration inputs.
- **`frontend/app/meeting/[meetingId]/page.tsx`**: Full-screen in-meeting room application managing WebRTC mesh peer connections, audio/video streams, screen sharing, participants, and meeting termination.

### UI Components
- **`frontend/components/Brand.tsx`**: Reusable Zoom brand logo and typography badge component.
- **`frontend/components/JoinModal.tsx`**: Modal popup allowing users to quickly join a meeting by ID from the dashboard.
- **`frontend/components/ScheduleModal.tsx`**: Modal popup for scheduling future meetings with date/time validation directly from the dashboard.
- **`frontend/components/MeetingCard.tsx`**: Individual meeting item card displaying meeting title, time badge, ID, and action triggers.
- **`frontend/components/MeetingList.tsx`**: Container component displaying lists of meetings with styled empty-state placeholders.
- **`frontend/components/Sidebar.tsx`**: Alternative collapsible navigation drawer for switching between workspace sections.
- **`frontend/components/Topbar.tsx`**: Header bar component displaying user session details and quick actions.
- **`frontend/components/Toast.tsx`**: Toast notification overlay for displaying status alerts, error warnings, and clipboard confirmations.

### Zoom Workplace Desktop Suite
- **`frontend/components/zoom/ZoomHeader.tsx`**: Top title bar matching the Zoom desktop app with global search and user profile menu.
- **`frontend/components/zoom/ZoomNavRail.tsx`**: Left vertical navigation bar for toggling between Home, Meetings, Team Chat, and Contacts.
- **`frontend/components/zoom/HomeView.tsx`**: Desktop home dashboard featuring the 4 quick action tiles, interactive calendar panel, and live time clock.
- **`frontend/components/zoom/MeetingsView.tsx`**: Split-pane meetings manager featuring Upcoming and Recent meeting tabs with detailed history cards.
- **`frontend/components/zoom/ChatView.tsx`**: Team chat interface featuring conversation channels, messaging history, and communication tools.
- **`frontend/components/zoom/ContactsView.tsx`**: Company directory and personal contacts browser with direct invitation capabilities.
- **`frontend/components/zoom/AuthModal.tsx`**: Clean modal popup handling user sign-in and account registration directly from the dashboard.
- **`frontend/components/zoom/SettingsModal.tsx`**: Preferences modal allowing users to configure audio devices, camera preferences, and general settings.
- **`frontend/components/zoom/QuickModals.tsx`**: Modal bundle implementing popups for Whiteboard, Recordings, Meeting Summaries, and Notes.
- **`frontend/components/zoom/Illustrations.tsx`**: Handcrafted SVG illustrations for zero-state screens in contacts, chat, and cloud recordings.

### Client Libraries & Types
- **`frontend/lib/api.ts`**: Typed REST client managing HTTP communication with the backend API endpoints.
- **`frontend/lib/auth.ts`**: Client-side authentication helpers and React hook (`useAuth`) for token storage and user session management.
- **`frontend/types/index.ts`**: TypeScript definitions for meetings, participants, user accounts, and WebRTC signaling messages.

### Build & Configuration
- **`frontend/package.json`**: NPM project manifest specifying React 19, Next.js 15, Lucide icons, and project build scripts.
- **`frontend/package-lock.json`**: Deterministic lockfile pinning exact versions of all frontend dependency trees.
- **`frontend/next.config.ts`**: Next.js compiler configuration with `outputFileTracingRoot` setup to optimize monorepo path tracing.
- **`frontend/next-env.d.ts`**: Auto-generated Next.js TypeScript declaration file for framework types.
- **`frontend/tsconfig.json`**: TypeScript compiler configuration defining paths, target standards, and strict type checking rules.
- **`frontend/tsconfig.tsbuildinfo`**: Incremental TypeScript build cache accelerating compile and type-check speeds.
- **`frontend/eslint.config.mjs`**: ESLint configuration setting code quality and linting standards for Next.js.
- **`frontend/postcss.config.mjs`**: PostCSS configuration file for CSS processing and styling transformation.
