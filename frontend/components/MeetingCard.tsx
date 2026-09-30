'use client';

import { Clock, Copy } from 'lucide-react';
import type { Meeting } from '@/types';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface MeetingCardProps {
  meeting: Meeting;
  onCopy: (m: Meeting) => void;
  onJoin?: (m: Meeting) => void;
}

export function MeetingCard({ meeting, onCopy, onJoin }: MeetingCardProps) {
  const dt = new Date(meeting.scheduled_time);
  const isJoinable = meeting.status !== 'ended';

  return (
    <div className="meeting-card">
      <div className="meeting-main">
        <div className="date-box">
          <strong>{dt.getDate()}</strong>
          <span>
            {dt.toLocaleDateString(undefined, { month: 'short' })}
          </span>
        </div>

        <div style={{ minWidth: 0 }}>
          <p className="meeting-title">{meeting.title}</p>
          <div className="meeting-meta">
            <Clock size={12} />
            {formatDate(meeting.scheduled_time)} at{' '}
            {formatTime(meeting.scheduled_time)} ·{' '}
            {meeting.duration_minutes} min
            {meeting.participant_count > 0 && (
              <span> · {meeting.participant_count} in room</span>
            )}
          </div>
        </div>
      </div>

      <div className="meeting-actions">
        <span className={`status ${meeting.status}`}>
          {meeting.status}
        </span>
        <button
          className="btn btn-light"
          onClick={() => onCopy(meeting)}
          title="Copy invitation link"
        >
          <Copy size={13} />
          Copy link
        </button>
        {isJoinable && (
          onJoin ? (
            <button
              className="btn btn-primary"
              onClick={() => onJoin(meeting)}
            >
              Join
            </button>
          ) : (
            <a
              className="btn btn-primary"
              href={`/meeting/${meeting.meeting_id}`}
            >
              Join
            </a>
          )
        )}
      </div>
    </div>
  );
}
