'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, LoaderCircle, LogIn, Video } from 'lucide-react';
import { api, isHostedMeetingId } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import type { AuthUser } from '@/types';

function extractMeetingId(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes('meeting=')) {
    const match = trimmed.match(/meeting=([^&]+)/);
    if (match) return match[1];
  }
  const pathMatch = trimmed.match(/\/meeting\/([^/?]+)/);
  if (pathMatch) return pathMatch[1];
  return trimmed.replace(/\s+/g, '');
}

function JoinForm() {
  const searchParams = useSearchParams();
  const initialMeeting = searchParams.get('meeting') || searchParams.get('id') || '';

  const [storedUser, setStoredUser] = useState<AuthUser | null>(null);
  const [meetingInput, setMeetingInput] = useState(initialMeeting);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      setStoredUser(user);
      setDisplayName((prev) => prev || user.display_name);
    }
  }, []);

  useEffect(() => {
    if (initialMeeting && !meetingInput) {
      setMeetingInput(initialMeeting);
    }
  }, [initialMeeting, meetingInput]);

  // If user joins through a link with meeting ID and is already logged in in this browser,
  // directly join without prompting for display name!
  useEffect(() => {
    const stored = getStoredUser();
    if (initialMeeting && stored && stored.display_name && !busy) {
      const meetingId = extractMeetingId(initialMeeting);
      if (meetingId) {
        setBusy(true);
        const isHosted = isHostedMeetingId(meetingId);
        api.join({
          meeting_id: meetingId,
          display_name: stored.display_name,
          is_host: isHosted ? true : undefined,
        }).then((result) => {
          const hostFlag = (result.is_host || isHosted) ? '&host=true' : '';
          window.location.href = `/meeting/${result.meeting.meeting_id}?session=${result.session_id}&name=${encodeURIComponent(stored.display_name)}${hostFlag}`;
        }).catch(() => {
          const fallbackSession = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
          const hostFlag = isHosted ? '&host=true' : '';
          window.location.href = `/meeting/${meetingId}?session=${fallbackSession}&name=${encodeURIComponent(stored.display_name)}${hostFlag}`;
        });
      }
    }
  }, [initialMeeting]);

  const submit = async () => {
    const meetingId = extractMeetingId(meetingInput);
    if (!meetingId) {
      setError('Please enter a meeting ID or invitation link.');
      return;
    }
    const nameToUse = (displayName.trim() || storedUser?.display_name || '').trim();
    if (!nameToUse || nameToUse.length < 2) {
      setError('Please enter your display name (at least 2 characters).');
      return;
    }

    setBusy(true);
    setError('');

    const isHosted = isHostedMeetingId(meetingId);

    try {
      const result = await api.join({
        meeting_id: meetingId,
        display_name: nameToUse,
        is_host: isHosted ? true : undefined,
      });
      const hostFlag = (result.is_host || isHosted) ? '&host=true' : '';
      window.location.href = `/meeting/${result.meeting.meeting_id}?session=${result.session_id}&name=${encodeURIComponent(nameToUse)}${hostFlag}`;
    } catch {
      // Backend doesn't know this meeting or is offline — redirect to the
      // meeting room page directly as participant.
      const fallbackSession = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const hostFlag = isHosted ? '&host=true' : '';
      window.location.href = `/meeting/${meetingId}?session=${fallbackSession}&name=${encodeURIComponent(nameToUse)}${hostFlag}`;
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
  };

  if (busy && initialMeeting && storedUser) {
    return (
      <div className="modal" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <LoaderCircle size={36} className="spin" style={{ color: '#0B5CFF', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
          Connecting to meeting...
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Joining room <strong>{initialMeeting}</strong> as <strong>{storedUser.display_name}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="modal">
      <a
        href="/"
        className="link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 28,
        }}
      >
        <ArrowLeft size={14} />
        Back to workspace
      </a>

      <span
        className="action-icon violet"
        style={{
          display: 'grid',
          width: 48,
          height: 48,
          marginBottom: 8,
        }}
      >
        <Video size={22} />
      </span>

      <div className="eyebrow" style={{ marginTop: 16 }}>
        Enter a room
      </div>

      <h1
        style={{
          fontSize: 28,
          letterSpacing: '-0.04em',
          margin: '6px 0 8px',
        }}
      >
        Join a meeting
      </h1>

      <p
        style={{
          color: 'var(--muted)',
          fontSize: 14,
          marginBottom: 24,
        }}
      >
        Use the meeting ID from your invitation, then choose how you
        would like to appear.
      </p>

      <div className="field">
        <label htmlFor="join-input">Meeting ID or invite link</label>
        <input
          id="join-input"
          value={meetingInput}
          onChange={(e) => setMeetingInput(e.target.value)}
          placeholder="e.g. 482190 or paste an invite link"
          onKeyDown={handleKeyDown}
          autoFocus={!initialMeeting}
        />
      </div>

      <div className="field">
        <label htmlFor="join-name">Display name</label>
        <input
          id="join-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          onKeyDown={handleKeyDown}
          autoFocus={!!initialMeeting}
        />
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <button
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 8 }}
        onClick={submit}
        disabled={busy}
      >
        {busy ? (
          <LoaderCircle size={15} className="spin" />
        ) : (
          <LogIn size={15} />
        )}
        {busy ? 'Joining...' : 'Join meeting'}
      </button>
    </div>
  );
}

export default function JoinPage() {
  return (
    <main className="page-center">
      <Suspense fallback={<div className="modal"><p>Loading...</p></div>}>
        <JoinForm />
      </Suspense>
    </main>
  );
}
