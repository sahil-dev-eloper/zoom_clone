'use client';

import { CalendarDays, ChevronRight, FileText } from 'lucide-react';
import type { Meeting } from '@/types';
import { MeetingCard } from './MeetingCard';

interface MeetingListProps {
  title: string;
  subtitle?: string;
  meetings: Meeting[];
  loading: boolean;
  emptyIcon: 'calendar' | 'file';
  emptyTitle: string;
  emptySubtitle?: string;
  onCopy: (m: Meeting) => void;
  onJoin?: (m: Meeting) => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function MeetingList({
  title,
  subtitle,
  meetings,
  loading,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
  onCopy,
  onJoin,
  action,
}: MeetingListProps) {
  const Icon = emptyIcon === 'calendar' ? CalendarDays : FileText;

  return (
    <>
      <div className="section-head">
        <h2>{title}</h2>
        {action && (
          <button className="link" onClick={action.onClick}>
            {action.label}{' '}
            <ChevronRight
              size={13}
              style={{ verticalAlign: '-2px' }}
            />
          </button>
        )}
        {subtitle && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {subtitle}
          </span>
        )}
      </div>

      {loading ? (
        <div className="meeting-list">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      ) : meetings.length > 0 ? (
        <div className="meeting-list">
          {meetings.map((m) => (
            <MeetingCard
              key={m.meeting_id}
              meeting={m}
              onCopy={onCopy}
              onJoin={onJoin}
            />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon size={24} />
          <div>{emptyTitle}</div>
          {emptySubtitle && <small>{emptySubtitle}</small>}
        </div>
      )}
    </>
  );
}
