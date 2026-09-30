'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  Share2,
  Users,
  Video,
  VideoOff,
  Volume2,
  UserX,
  AlertTriangle,
  LoaderCircle,
  Monitor,
  LogIn,
  Check,
} from 'lucide-react';

import { api } from '@/lib/api';
import type { Meeting, Participant } from '@/types';
import { Brand } from '@/components/Brand';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitial(name: string): string {
  return (name || 'G').charAt(0).toUpperCase();
}

function useSearchParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

// ---------------------------------------------------------------------------
// Meeting Room Page
// ---------------------------------------------------------------------------

export default function MeetingRoomPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = use(params);

  // Query params
  const query = useSearchParams();
  const initialName = query.get('name') || '';
  const initialSession = query.get('session') || '';
  const initialHost = query.get('host') === 'true';

  // Session & Identity State
  const [displayName, setDisplayName] = useState(initialName);
  const [sessionId, setSessionId] = useState(initialSession);
  const [isHost, setIsHost] = useState(initialHost);
  const [joinPromptName, setJoinPromptName] = useState(initialName || '');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Meeting State
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [people, setPeople] = useState<Participant[]>([]);
  const [muted, setMuted] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [kicked, setKicked] = useState(false);
  const [hasLoadedInitialParticipants, setHasLoadedInitialParticipants] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // ---- Load meeting details ----

  const loadMeeting = useCallback(async () => {
    try {
      const m = await api.details(meetingId);
      setMeeting(m);
      if (m.status === 'ended') {
        setError('This meeting has ended.');
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load meeting details.'
      );
    }
  }, [meetingId]);

  // ---- Load participants & detect kicked ----

  const loadParticipants = useCallback(async () => {
    try {
      const parts = await api.participants(meetingId);
      setPeople(parts);
      setHasLoadedInitialParticipants(true);

      // If user had joined and sessionId is active, verify they are still in participants
      if (sessionId) {
        const stillInRoom = parts.some(
          (p) => p.session_id === sessionId && p.left_at === null
        );
        if (hasLoadedInitialParticipants && !stillInRoom) {
          setKicked(true);
        }
      }
    } catch {
      // Silent fail for polling
    }
  }, [meetingId, sessionId, hasLoadedInitialParticipants]);

  useEffect(() => {
    loadMeeting();
  }, [loadMeeting]);

  useEffect(() => {
    if (!sessionId) return;
    loadParticipants();

    // Poll participants every 4 seconds
    pollRef.current = setInterval(loadParticipants, 4000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId, loadParticipants]);

  // ---- WebSocket Signaling ----

  useEffect(() => {
    if (!sessionId || !meetingId) return;

    const baseApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wsUrl = baseApi.replace(/^http/, 'ws') + `/ws/meetings/${meetingId}`;

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: 'join',
            peerId: sessionId,
            displayName: displayName || 'Guest',
          })
        );
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'peer-joined' || msg.type === 'peer-left') {
            loadParticipants();
          }
        } catch {
          // ignore malformed ws messages
        }
      };
    } catch {
      // WebSocket fallback
    }

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({
              type: 'leave',
              peerId: sessionId,
            })
          );
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [sessionId, meetingId, displayName, loadParticipants]);

  // ---- Handle Lobby Direct Join ----

  const handleLobbyJoin = async () => {
    if (!joinPromptName.trim() || joinPromptName.trim().length < 2) {
      setJoinError('Please enter your display name (at least 2 characters).');
      return;
    }

    setJoining(true);
    setJoinError('');

    try {
      const res = await api.join({
        meeting_id: meetingId,
        display_name: joinPromptName.trim(),
      });
      setSessionId(res.session_id);
      setDisplayName(joinPromptName.trim());
      setIsHost(res.is_host);
      setMeeting(res.meeting);
      // Update browser URL without full reload
      const newUrl = `/meeting/${meetingId}?session=${res.session_id}&name=${encodeURIComponent(joinPromptName.trim())}${res.is_host ? '&host=true' : ''}`;
      window.history.replaceState(null, '', newUrl);
    } catch (e) {
      setJoinError(
        e instanceof Error ? e.message : 'Unable to join meeting.'
      );
    } finally {
      setJoining(false);
    }
  };

  // ---- Media controls ----

  const toggleCamera = async () => {
    if (cameraOn) {
      videoStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: false,
      });
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
      setMediaError('');
    } catch {
      setMediaError(
        'Camera permission was denied. You can still participate with audio.'
      );
    }
  };

  const toggleMic = async () => {
    if (!muted) {
      audioStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
      setMuted(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      audioStreamRef.current = stream;
      setMuted(false);
      setMediaError('');
    } catch {
      setMediaError(
        'Microphone permission was denied. You can still participate with video.'
      );
    }
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      setScreenSharing(false);
      return;
    }

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setMediaError('Screen sharing is not supported by your current browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        screenVideoRef.current.play().catch(() => {});
      }
      setScreenSharing(true);
      setMediaError('');

      stream.getVideoTracks()[0].onended = () => {
        setScreenSharing(false);
        screenStreamRef.current = null;
      };
    } catch {
      // User cancelled screen picker
    }
  };

  // ---- Leave / End ----

  const cleanup = () => {
    videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (pollRef.current) clearInterval(pollRef.current);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      if (sessionId) {
        await api.leave(meetingId, sessionId);
      }
    } catch {
      // best effort
    }
    cleanup();
    window.location.href = '/';
  };

  const handleEnd = async () => {
    setLeaving(true);
    try {
      await api.end(meetingId);
    } catch {
      // best effort
    }
    cleanup();
    window.location.href = '/';
  };

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, []);

  // ---- Copy invitation ----

  const copyInvite = async () => {
    if (!meeting) return;
    try {
      await navigator.clipboard?.writeText(meeting.invite_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // ---- Host: kick participant ----

  const handleKick = async (participantId: number) => {
    if (!sessionId || !isHost) return;
    try {
      await api.kick(meetingId, {
        host_session_id: sessionId,
        participant_id: participantId,
      });
      loadParticipants();
    } catch {
      // silent
    }
  };

  // ---- Render: Kicked state ----

  if (kicked) {
    return (
      <main
        className="meeting-room"
        style={{ display: 'grid', placeItems: 'center' }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <UserX
            size={52}
            style={{ color: '#ef4444', marginBottom: 16, margin: '0 auto 16px' }}
          />
          <h2 style={{ fontSize: 24, marginBottom: 8, color: '#f87171' }}>
            Removed from meeting
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
            The meeting host has removed you from this meeting room.
          </p>
          <a className="btn btn-primary" href="/">
            Return home
          </a>
        </div>
      </main>
    );
  }

  // ---- Render: Error state ----

  if (error && !meeting) {
    return (
      <main
        className="meeting-room"
        style={{ display: 'grid', placeItems: 'center' }}
      >
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
          <AlertTriangle
            size={48}
            style={{ color: '#f59e0b', margin: '0 auto 16px' }}
          />
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>
            Room unavailable
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
            {error}
          </p>
          <a className="btn btn-primary" href="/">
            Return home
          </a>
        </div>
      </main>
    );
  }

  // ---- Render: Loading state ----

  if (!meeting) {
    return (
      <main
        className="meeting-room"
        style={{ display: 'grid', placeItems: 'center' }}
      >
        <div
          style={{
            textAlign: 'center',
            color: '#94a3b8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <LoaderCircle size={32} className="spin" />
          <span>Connecting to FocusRoom...</span>
        </div>
      </main>
    );
  }

  // ---- Render: Direct Join Lobby (if no session established) ----

  if (!sessionId) {
    return (
      <main className="page-center">
        <div className="modal" style={{ width: 'min(480px, 100%)' }}>
          <div className="modal-head">
            <div>
              <div className="eyebrow">Ready to join?</div>
              <h2>{meeting.title}</h2>
            </div>
            <span className="meeting-id-badge">Room {meeting.meeting_id}</span>
          </div>

          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
            {meeting.description || 'You are about to join this meeting room.'}
          </p>

          <div className="field">
            <label htmlFor="lobby-name">Your display name</label>
            <input
              id="lobby-name"
              value={joinPromptName}
              onChange={(e) => setJoinPromptName(e.target.value)}
              placeholder="e.g. Alex Morgan or your name"
              onKeyDown={(e) => e.key === 'Enter' && handleLobbyJoin()}
              autoFocus
            />
          </div>

          {joinError && <p className="form-error" role="alert">{joinError}</p>}

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={handleLobbyJoin}
            disabled={joining}
          >
            {joining ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <LogIn size={15} />
            )}
            {joining ? 'Entering room...' : 'Join Meeting'}
          </button>
        </div>
      </main>
    );
  }

  // ---- Grid layout calculation ----

  const otherPeople = people.filter(
    (p) => p.session_id !== sessionId
  );
  const totalTiles = 1 + otherPeople.length + (screenSharing ? 1 : 0);
  const gridClass =
    totalTiles <= 1
      ? 'video-grid solo'
      : totalTiles <= 2
        ? 'video-grid'
        : totalTiles <= 4
          ? 'video-grid four'
          : 'video-grid';

  // ---- Render: Active Meeting Room ----

  return (
    <main className="meeting-room">
      {/* Top bar */}
      <header className="room-top">
        <div className="room-brand">
          <Brand variant="dark" size="sm" />
          <small style={{ color: '#64748b' }}>/ {meeting.title}</small>
        </div>

        <div className="room-info">
          <span className="meeting-id-badge">
            Room {meeting.meeting_id}
          </span>
          <span>
            {people.length || 1} participant
            {(people.length || 1) !== 1 ? 's' : ''}
          </span>
          <button className="tool" title="Room settings" aria-label="Settings">
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Media error banner */}
      {mediaError && (
        <div
          style={{
            background: 'rgba(234, 88, 12, 0.1)',
            borderBottom: '1px solid rgba(234, 88, 12, 0.2)',
            padding: '8px 24px',
            fontSize: 12,
            color: '#fb923c',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={14} />
          {mediaError}
          <button
            className="link"
            style={{ marginLeft: 'auto', color: '#fb923c', fontSize: 11 }}
            onClick={() => setMediaError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Ended banner */}
      {meeting.status === 'ended' && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
            padding: '10px 24px',
            fontSize: 13,
            color: '#f87171',
            textAlign: 'center',
          }}
        >
          This meeting has ended.{' '}
          <a href="/" className="link" style={{ color: '#f87171' }}>
            Return home →
          </a>
        </div>
      )}

      {/* Main content */}
      <div className="room-content">
        {/* Video grid */}
        <section className={gridClass}>
          {/* Screen share tile (if active) */}
          {screenSharing && (
            <div className="tile" style={{ background: '#090d16' }}>
              <video
                ref={screenVideoRef}
                muted
                playsInline
                autoPlay
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
              <span className="tile-label">
                <Monitor size={12} style={{ color: '#38bdf8' }} />
                Your screen share
              </span>
            </div>
          )}

          {/* Self video/avatar tile */}
          <div className="tile self">
            {cameraOn ? (
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)',
                }}
              />
            ) : (
              <div className="tile-avatar">
                {getInitial(displayName)}
              </div>
            )}
            <span className="tile-label">
              <span
                className={muted ? 'mic-off-indicator' : 'mic-indicator'}
              />
              {displayName} (You){isHost ? ' · Host' : ''}
            </span>
            {!muted && <span className="speaking-ring" />}
          </div>

          {/* Other participants */}
          {otherPeople.slice(0, 5).map((p) => (
            <div className="tile" key={p.id}>
              <div className="tile-avatar">
                {getInitial(p.display_name)}
              </div>
              <span className="tile-label">
                <span className="mic-indicator" />
                {p.display_name}
                {p.is_host ? ' · Host' : ''}
              </span>
            </div>
          ))}
        </section>

        {/* Side panel */}
        {panelOpen && (
          <aside className="side-panel">
            <h3>
              Participants{' '}
              <span style={{ color: '#64748b', fontWeight: 400 }}>
                ({people.length || 1})
              </span>
            </h3>
            <p className="side-panel-note">
              Invite people to this room using the invitation link below.
            </p>

            {/* Participant list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Self */}
              <div className="participant-item">
                <span className="mini-avatar">
                  {getInitial(displayName)}
                </span>
                <div className="participant-info">
                  <div className="name">{displayName} (You)</div>
                  {isHost && <div className="role">Host</div>}
                </div>
                <Volume2
                  size={14}
                  style={{ color: muted ? '#64748b' : '#22c55e' }}
                />
              </div>

              {/* Others */}
              {otherPeople.map((p) => (
                <div className="participant-item" key={p.id}>
                  <span className="mini-avatar">
                    {getInitial(p.display_name)}
                  </span>
                  <div className="participant-info">
                    <div className="name">{p.display_name}</div>
                    {p.is_host && <div className="role">Host</div>}
                  </div>
                  <div className="participant-actions">
                    <Volume2 size={14} style={{ color: '#22c55e' }} />
                    {isHost && !p.is_host && (
                      <button
                        title={`Remove ${p.display_name}`}
                        aria-label={`Remove ${p.display_name}`}
                        onClick={() => handleKick(p.id)}
                      >
                        <UserX size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Invite section */}
            <div className="invite-section">
              <p>Share this link to invite others:</p>
              <div className="invite-input-row">
                <input
                  readOnly
                  value={meeting.invite_url}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  aria-label="Invitation URL"
                />
                <button onClick={copyInvite} aria-label="Copy invitation link">
                  {copied ? (
                    <>
                      <Check size={12} style={{ marginRight: 4 }} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={12} style={{ marginRight: 4 }} />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Bottom toolbar */}
      <footer className="room-bottom">
        <button
          className={`tool ${!muted ? 'active' : ''}`}
          onClick={toggleMic}
          title={muted ? 'Unmute microphone' : 'Mute microphone'}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        <button
          className={`tool ${cameraOn ? 'active' : ''}`}
          onClick={toggleCamera}
          title={cameraOn ? 'Turn off camera' : 'Turn on camera'}
          aria-label={cameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>

        <button
          className={`tool ${screenSharing ? 'active' : ''}`}
          onClick={toggleScreenShare}
          title={screenSharing ? 'Stop sharing screen' : 'Share screen'}
          aria-label="Share screen"
        >
          <Monitor size={18} />
        </button>

        <button
          className={`tool ${panelOpen ? 'active' : ''}`}
          onClick={() => setPanelOpen(!panelOpen)}
          title="Toggle participants panel"
          aria-label="Toggle participants panel"
        >
          <Users size={18} />
        </button>

        <button
          className="tool"
          onClick={copyInvite}
          title="Share invitation link"
          aria-label="Copy invitation link"
        >
          <Share2 size={18} />
        </button>

        {/* Leave button */}
        <button
          className="tool-leave"
          onClick={handleLeave}
          disabled={leaving}
          title="Leave meeting"
          aria-label="Leave meeting"
        >
          <PhoneOff size={16} />
          <span>Leave</span>
        </button>

        {/* End meeting (host only) */}
        {isHost && meeting.status !== 'ended' && (
          <button
            className="tool-end"
            onClick={handleEnd}
            disabled={leaving}
            title="End meeting for all participants"
            aria-label="End meeting for all"
          >
            <PhoneOff size={14} />
            End
          </button>
        )}
      </footer>
    </main>
  );
}
