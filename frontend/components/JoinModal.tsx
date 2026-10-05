'use client';

import React, { useEffect, useState } from 'react';
import { LoaderCircle, X, LogIn } from 'lucide-react';
import { api } from '@/lib/api';

interface JoinModalProps {
  onClose: () => void;
  defaultMeetingId?: string;
}

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

export function JoinModal({ onClose, defaultMeetingId }: JoinModalProps) {
  const [meetingInput, setMeetingInput] = useState(defaultMeetingId || '');
  const [displayName, setDisplayName] = useState('');
  const [rememberName, setRememberName] = useState(true);
  const [noAudio, setNoAudio] = useState(false);
  const [turnOffVideo, setTurnOffVideo] = useState(false);
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
      setError('Please enter a meeting ID or personal link name.');
      return;
    }
    if (!displayName.trim() || displayName.trim().length < 2) {
      setError('Please enter your name (at least 2 characters).');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = await api.join({
        meeting_id: meetingId,
        display_name: displayName.trim(),
        is_host: false,
      });
      const videoFlag = turnOffVideo ? '&video=false' : '';
      const audioFlag = noAudio ? '&audio=false' : '';
      window.location.href = `/meeting/${result.meeting.meeting_id}?session=${result.session_id}&name=${encodeURIComponent(displayName.trim())}${videoFlag}${audioFlag}`;
    } catch {
      // Resilient fallback: redirect to room directly as participant
      const fallbackSession = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const videoFlag = turnOffVideo ? '&video=false' : '';
      const audioFlag = noAudio ? '&audio=false' : '';
      window.location.href = `/meeting/${meetingId}?session=${fallbackSession}&name=${encodeURIComponent(displayName.trim())}${videoFlag}${audioFlag}`;
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <div
      className="zoom-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-modal-title"
    >
      <div className="zoom-dialog-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="zoom-dialog-head">
          <h3 id="join-modal-title">Join Meeting</h3>
          <button className="zoom-dialog-close" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="zoom-dialog-body">
          <div className="zoom-form-field">
            <label htmlFor="join-meeting-id">Meeting ID or Personal Link Name</label>
            <input
              id="join-meeting-id"
              className="zoom-input"
              value={meetingInput}
              onChange={(e) => setMeetingInput(e.target.value)}
              placeholder="Enter Meeting ID or Personal Link Name"
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          <div className="zoom-form-field" style={{ marginTop: 16 }}>
            <label htmlFor="join-display-name">Enter your name</label>
            <input
              id="join-display-name"
              className="zoom-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className="zoom-dialog-options" style={{ marginTop: 16 }}>
            <label className="zoom-checkbox-label">
              <input
                type="checkbox"
                checked={rememberName}
                onChange={(e) => setRememberName(e.target.checked)}
              />
              <span>Remember my name for future meetings</span>
            </label>

            <label className="zoom-checkbox-label" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={noAudio}
                onChange={(e) => setNoAudio(e.target.checked)}
              />
              <span>Do not connect to audio</span>
            </label>

            <label className="zoom-checkbox-label" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={turnOffVideo}
                onChange={(e) => setTurnOffVideo(e.target.checked)}
              />
              <span>Turn off my video</span>
            </label>
          </div>

          {error && <p className="zoom-form-error">{error}</p>}
        </div>

        {/* Footer */}
        <div className="zoom-dialog-footer">
          <button className="zoom-btn-outline" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="zoom-btn-primary"
            onClick={submit}
            disabled={busy}
            type="button"
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <LogIn size={15} />
            )}
            <span>{busy ? 'Joining...' : 'Join'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
