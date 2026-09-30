'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, LogIn, X } from 'lucide-react';
import { api } from '@/lib/api';

interface JoinModalProps {
  onClose: () => void;
  defaultMeetingId?: string;
}

/**
 * Extracts a meeting ID from an invitation URL or returns the raw input.
 *
 * Handles patterns like:
 *   - "http://localhost:3000/join?meeting=123456&token=..."
 *   - "123456"
 */
function extractMeetingId(input: string): string {
  const trimmed = input.trim();

  // Try to extract from URL
  if (trimmed.includes('meeting=')) {
    const match = trimmed.match(/meeting=([^&]+)/);
    if (match) return match[1];
  }

  // Try to extract from /meeting/XXXXXX path
  const pathMatch = trimmed.match(/\/meeting\/([^/?]+)/);
  if (pathMatch) return pathMatch[1];

  // Return raw (strip spaces for pasted IDs like "123 456")
  return trimmed.replace(/\s+/g, '');
}

export function JoinModal({ onClose, defaultMeetingId }: JoinModalProps) {
  const [meetingInput, setMeetingInput] = useState(defaultMeetingId || '');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
    <div
      className="modal-bg"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-modal-title"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Enter a room</div>
            <h2 id="join-modal-title">Join a meeting</h2>
          </div>
          <button className="close" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        <div className="field">
          <label htmlFor="join-meeting-id">Meeting ID or invite link</label>
          <input
            id="join-meeting-id"
            value={meetingInput}
            onChange={(e) => setMeetingInput(e.target.value)}
            placeholder="e.g. 482190 or paste an invite link"
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="join-display-name">Your display name</label>
          <input
            id="join-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How others will see you"
            onKeyDown={handleKeyDown}
          />
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 4 }}
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
    </div>
  );
}
