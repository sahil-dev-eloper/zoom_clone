'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, LoaderCircle, LogIn, Video } from 'lucide-react';
import { api } from '@/lib/api';

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

  const [meetingInput, setMeetingInput] = useState(initialMeeting);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialMeeting && !meetingInput) {
      setMeetingInput(initialMeeting);
    }
  }, [initialMeeting, meetingInput]);

  const submit = async () => {
    const meetingId = extractMeetingId(meetingInput);
    if (!meetingId) {
      setError('Please enter a meeting ID or invitation link.');
      return;
    }
    if (!displayName.trim() || displayName.trim().length < 2) {
      setError('Please enter your display name (at least 2 characters).');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = await api.join({
        meeting_id: meetingId,
        display_name: displayName.trim(),
      });
      const hostFlag = result.is_host ? '&host=true' : '';
      window.location.href = `/meeting/${result.meeting.meeting_id}?session=${result.session_id}&name=${encodeURIComponent(displayName.trim())}${hostFlag}`;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to join this meeting.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
  };

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
