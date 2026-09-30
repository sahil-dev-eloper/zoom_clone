'use client';

import { useEffect, useState } from 'react';
import {
  CalendarDays,
  LoaderCircle,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Meeting } from '@/types';

interface ScheduleModalProps {
  onClose: () => void;
  onCreated: (meeting: Meeting) => void;
}

export function ScheduleModal({ onClose, onCreated }: ScheduleModalProps) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    duration: '30',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async () => {
    if (!form.title.trim()) {
      setError('Please enter a meeting title.');
      return;
    }
    if (form.title.trim().length < 2) {
      setError('Title must be at least 2 characters.');
      return;
    }
    if (!form.date || !form.time) {
      setError('Please select a date and time.');
      return;
    }

    const localDate = new Date(`${form.date}T${form.time}`);
    if (isNaN(localDate.getTime())) {
      setError('Please enter a valid date and time.');
      return;
    }
    if (localDate.getTime() <= Date.now()) {
      setError('Scheduled time must be in the future.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const meeting = await api.schedule({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        scheduled_time: localDate.toISOString(),
        duration_minutes: Number(form.duration),
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

  return (
    <div
      className="modal-bg"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Plan ahead</div>
            <h2 id="schedule-modal-title">Schedule a meeting</h2>
          </div>
          <button className="close" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        <div className="field">
          <label htmlFor="sched-title">Meeting title</label>
          <input
            id="sched-title"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="e.g. Product design review"
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="sched-desc">
            Description <span className="optional">(optional)</span>
          </label>
          <textarea
            id="sched-desc"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="What should participants prepare?"
          />
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="sched-date">Date</label>
            <input
              id="sched-date"
              type="date"
              value={form.date}
              onChange={(e) => update('date', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="sched-time">Time</label>
            <input
              id="sched-time"
              type="time"
              value={form.time}
              onChange={(e) => update('time', e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="sched-duration">Duration</label>
          <select
            id="sched-duration"
            value={form.duration}
            onChange={(e) => update('duration', e.target.value)}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">1 hour</option>
            <option value="90">90 minutes</option>
            <option value="120">2 hours</option>
          </select>
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
            <CalendarDays size={15} />
          )}
          {busy ? 'Creating...' : 'Schedule meeting'}
        </button>
      </div>
    </div>
  );
}
