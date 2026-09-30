'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  LogIn,
  Plus,
  Video,
  AlertCircle,
} from 'lucide-react';

import { api } from '@/lib/api';
import type { Meeting } from '@/types';

import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { MeetingList } from '@/components/MeetingList';
import { ScheduleModal } from '@/components/ScheduleModal';
import { JoinModal } from '@/components/JoinModal';
import { Toast } from '@/components/Toast';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const [upcoming, setUpcoming] = useState<Meeting[]>([]);
  const [recent, setRecent] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'schedule' | 'join' | null>(null);
  const [joinDefaultId, setJoinDefaultId] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const [u, r] = await Promise.all([api.upcoming(), api.recent()]);
      setUpcoming(u);
      setRecent(r);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not reach the meeting service.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleInstant = async () => {
    try {
      setError('');
      const m = await api.instant();
      const joined = await api.join({
        meeting_id: m.meeting_id,
        display_name: 'Sahil Dargar',
      });
      window.location.href = `/meeting/${m.meeting_id}?session=${joined.session_id}&name=Sahil%20Dargar&host=true`;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to start meeting.'
      );
    }
  };

  const handleCopy = async (m: Meeting) => {
    try {
      await navigator.clipboard?.writeText(m.invite_url);
      setToast('Invitation link copied to clipboard');
    } catch {
      setToast('Could not copy link');
    }
  };

  const handleScheduled = (_meeting: Meeting) => {
    setModal(null);
    load();
    setToast('Meeting scheduled successfully');
  };

  return (
    <div className="shell">
      <Sidebar
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onJoin={() => {
          setMobileNavOpen(false);
          setJoinDefaultId('');
          setModal('join');
        }}
        onSchedule={() => {
          setMobileNavOpen(false);
          setModal('schedule');
        }}
      />

      <main className="main">
        <Topbar onMenuClick={() => setMobileNavOpen(!mobileNavOpen)} />

        <div className="content">
          {/* Hero section */}
          <div className="hero">
            <div>
              <div className="eyebrow">Your workspace</div>
              <h1 suppressHydrationWarning>{getGreeting()}, Alex</h1>
              <p>Everything you need for your next conversation.</p>
            </div>
            <div className="actions">
              <button
                className="btn btn-light"
                onClick={() => setModal('join')}
              >
                <LogIn size={15} />
                Join
              </button>
              <button className="btn btn-primary" onClick={handleInstant}>
                <Plus size={16} />
                New meeting
              </button>
            </div>
          </div>

          {/* Action cards */}
          <div className="action-grid">
            <button className="action-card" onClick={handleInstant}>
              <span className="action-icon blue">
                <Video size={20} />
              </span>
              <span>
                <h3>New meeting</h3>
                <p>Start an instant room</p>
              </span>
              <ChevronRight
                size={16}
                color="var(--subtle)"
                style={{ marginLeft: 'auto' }}
              />
            </button>

            <button
              className="action-card"
              onClick={() => setModal('join')}
            >
              <span className="action-icon violet">
                <LogIn size={20} />
              </span>
              <span>
                <h3>Join a meeting</h3>
                <p>Use an ID or invite link</p>
              </span>
              <ChevronRight
                size={16}
                color="var(--subtle)"
                style={{ marginLeft: 'auto' }}
              />
            </button>

            <button
              className="action-card"
              onClick={() => setModal('schedule')}
            >
              <span className="action-icon green">
                <CalendarDays size={20} />
              </span>
              <span>
                <h3>Schedule</h3>
                <p>Plan it for later</p>
              </span>
              <ChevronRight
                size={16}
                color="var(--subtle)"
                style={{ marginLeft: 'auto' }}
              />
            </button>
          </div>

          {/* Error banner */}
          {error && (
            <div className="error-banner">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button
                className="link"
                onClick={load}
                style={{ marginLeft: 'auto' }}
              >
                Try again
              </button>
            </div>
          )}

          {/* Upcoming meetings */}
          <MeetingList
            title="Upcoming meetings"
            meetings={upcoming}
            loading={loading}
            emptyIcon="calendar"
            emptyTitle="No upcoming meetings"
            emptySubtitle="Your schedule is clear. Create a room when you're ready."
            onCopy={handleCopy}
            onJoin={(m) => {
              setJoinDefaultId(m.meeting_id);
              setModal('join');
            }}
            action={{
              label: 'View calendar',
              onClick: () => setModal('schedule'),
            }}
          />

          {/* Recent meetings */}
          <div style={{ marginTop: 36 }}>
            <MeetingList
              title="Recent meetings"
              subtitle="Last 10 rooms"
              meetings={recent}
              loading={loading}
              emptyIcon="file"
              emptyTitle="No recent meetings yet"
              emptySubtitle="Completed meetings will appear here."
              onCopy={handleCopy}
            />
          </div>
        </div>
      </main>

      {/* Modals */}
      {modal === 'schedule' && (
        <ScheduleModal
          onClose={() => setModal(null)}
          onCreated={handleScheduled}
        />
      )}

      {modal === 'join' && (
        <JoinModal
          defaultMeetingId={joinDefaultId}
          onClose={() => {
            setModal(null);
            setJoinDefaultId('');
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast message={toast} onDismiss={() => setToast('')} />
      )}
    </div>
  );
}
