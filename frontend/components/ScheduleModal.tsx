'use client';

import React, { useEffect, useState } from 'react';
import { LoaderCircle, X, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import type { Meeting } from '@/types';
import { useAuth } from '@/lib/auth';

interface ScheduleModalProps {
  onClose: () => void;
  onCreated: (meeting: Meeting) => void;
  onRequireAuth?: () => void;
}

export function ScheduleModal({ onClose, onCreated, onRequireAuth }: ScheduleModalProps) {
  const { user, isLoggedIn } = useAuth();
  const [title, setTitle] = useState(() => (user?.display_name ? `${user.display_name}'s Meeting` : 'My Meeting'));
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [time, setTime] = useState('11:00');
  const [duration, setDuration] = useState('30');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Sync title with user display name if it becomes available
  useEffect(() => {
    if (user?.display_name && title === 'My Meeting') {
      setTitle(`${user.display_name}'s Meeting`);
    }
  }, [user, title]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const submit = async () => {
    if (!title.trim()) {
      setError('Please enter a meeting title.');
      return;
    }
    if (!date || !time) {
      setError('Please select a date and start time.');
      return;
    }

    const localDate = new Date(`${date}T${time}`);
    if (isNaN(localDate.getTime())) {
      setError('Please enter a valid date and time.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const meeting = await api.schedule({
        title: title.trim(),
        description: description.trim() || undefined,
        scheduled_time: localDate.toISOString(),
        duration_minutes: Number(duration),
      });
      onCreated(meeting);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to schedule meeting.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div
        className="zoom-modal-backdrop"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="zoom-dialog-modal"
          style={{ width: 440, padding: 0, overflow: 'hidden' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="zoom-dialog-head">
            <h3>Sign in Required</h3>
            <button className="zoom-dialog-close" onClick={onClose} aria-label="Close modal">
              <X size={16} />
            </button>
          </div>
          <div className="zoom-dialog-body" style={{ padding: '24px 20px' }}>
            <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 13.5, lineHeight: 1.5 }}>
              You need to sign in to your Zoom Workplace account to schedule a meeting.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-outline"
                style={{ flex: 1, padding: '10px' }}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => {
                  onClose();
                  onRequireAuth?.();
                }}
              >
                Sign In / Register
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="zoom-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
    >
      <div className="zoom-dialog-modal" style={{ maxWidth: 500, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="zoom-dialog-head">
          <h3 id="schedule-modal-title">Schedule Meeting</h3>
          <button className="zoom-dialog-close" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <div className="zoom-dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. Title */}
          <div className="zoom-form-field">
            <label htmlFor="sched-title">
              Title <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              id="sched-title"
              className="zoom-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Team Sync"
              autoFocus
            />
          </div>

          {/* 2. Description (not compulsory) */}
          <div className="zoom-form-field">
            <label htmlFor="sched-description">
              Description <span style={{ color: '#94A3B8', fontWeight: 400, fontSize: 12 }}>(Optional)</span>
            </label>
            <textarea
              id="sched-description"
              className="zoom-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add meeting agenda or notes (optional)..."
              rows={3}
            />
          </div>

          {/* 3. Date & Time Picker */}
          <div className="zoom-form-row">
            <div className="zoom-form-field" style={{ flex: 1 }}>
              <label htmlFor="sched-date">
                Date <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                id="sched-date"
                type="date"
                className="zoom-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="zoom-form-field" style={{ width: 140 }}>
              <label htmlFor="sched-time">
                Start Time <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                id="sched-time"
                type="time"
                className="zoom-input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* 4. Duration */}
          <div className="zoom-form-field">
            <label htmlFor="sched-duration">Duration</label>
            <select
              id="sched-duration"
              className="zoom-select"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour (60 min)</option>
              <option value="90">1.5 hours (90 min)</option>
              <option value="120">2 hours (120 min)</option>
              <option value="180">3 hours</option>
              <option value="240">4 hours</option>
            </select>
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
              <Calendar size={15} />
            )}
            <span>{busy ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
