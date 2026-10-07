'use client';

import { useState } from 'react';
import { ArrowLeft, CalendarDays, LoaderCircle } from 'lucide-react';
import { api } from '@/lib/api';

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTimeString(d: Date = new Date()): string {
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hour}:${min}`;
}

export default function SchedulePage() {
  const todayStr = getLocalDateString();
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    duration: '30',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      setError('Meetings cannot be scheduled in the past. Please select a future date and time.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      await api.schedule({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        scheduled_time: localDate.toISOString(),
        duration_minutes: Number(form.duration),
      });
      window.location.href = '/';
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to schedule meeting.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-center">
      <div className="modal" style={{ width: 'min(520px, 100%)' }}>
        <a
          href="/"
          className="link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 24,
          }}
        >
          <ArrowLeft size={14} />
          Back to workspace
        </a>

        <div className="modal-head">
          <div>
            <div className="eyebrow">Plan ahead</div>
            <h2>Schedule a meeting</h2>
          </div>
          <span
            className="action-icon green"
            style={{ display: 'grid', width: 44, height: 44 }}
          >
            <CalendarDays size={20} />
          </span>
        </div>

        <div className="field">
          <label>Meeting title</label>
          <input
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="e.g. Product review"
            autoFocus
          />
        </div>

        <div className="field">
          <label>
            Description <span className="optional">(optional)</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Add context for your guests"
          />
        </div>

        <div className="form-row">
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={form.date}
              min={todayStr}
              onChange={(e) => {
                update('date', e.target.value);
                setError('');
              }}
            />
          </div>
          <div className="field">
            <label>Time</label>
            <input
              type="time"
              value={form.time}
              min={form.date === todayStr ? getLocalTimeString() : undefined}
              onChange={(e) => {
                update('time', e.target.value);
                setError('');
              }}
            />
          </div>
        </div>

        <div className="field">
          <label>Duration</label>
          <select
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

        {error && <p className="form-error">{error}</p>}

        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={submit}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <CalendarDays size={15} />
          )}
          {busy ? 'Scheduling...' : 'Schedule meeting'}
        </button>
      </div>
    </main>
  );
}
