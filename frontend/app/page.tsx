'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api, formatInviteUrl } from '@/lib/api';
import { getStoredUser, useAuth } from '@/lib/auth';
import type { Meeting } from '@/types';
import { isSeedMeeting } from '@/types';

import { ZoomHeader } from '@/components/zoom/ZoomHeader';
import { ZoomNavRail, ZoomTab } from '@/components/zoom/ZoomNavRail';
import { HomeView } from '@/components/zoom/HomeView';
import { MeetingsView } from '@/components/zoom/MeetingsView';
import {
  RecordingsModal,
  SummariesModal,
  NotesModal,
} from '@/components/zoom/QuickModals';
import { JoinModal } from '@/components/JoinModal';
import { ScheduleModal } from '@/components/ScheduleModal';
import { AuthModal } from '@/components/zoom/AuthModal';
import { Toast } from '@/components/Toast';

export default function ZoomWorkplaceDashboard() {
  const { user, isLoggedIn } = useAuth();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<ZoomTab>('home');

  // API data
  const [upcoming, setUpcoming] = useState<Meeting[]>([]);
  const [recent, setRecent] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  const [summariesOpen, setSummariesOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authPromptConfig, setAuthPromptConfig] = useState<{ title?: string; subtitle?: string }>({});
  const [pendingAfterAuth, setPendingAfterAuth] = useState<'schedule' | 'instant' | null>(null);
  const [joinDefaultId, setJoinDefaultId] = useState('');
  const [toast, setToast] = useState('');

  // Handle scheduling: require authentication first if not logged in
  const handleOpenSchedule = () => {
    if (isLoggedIn) {
      setScheduleModalOpen(true);
    } else {
      setAuthPromptConfig({
        title: 'Sign in to Schedule Meeting',
        subtitle: 'Please sign in or create an account to schedule meetings and manage invites.',
      });
      setPendingAfterAuth('schedule');
      setAuthModalOpen(true);
    }
  };

  const handleAuthSuccess = () => {
    if (pendingAfterAuth === 'schedule') {
      setPendingAfterAuth(null);
      setScheduleModalOpen(true);
    } else if (pendingAfterAuth === 'instant') {
      setPendingAfterAuth(null);
      setTimeout(() => {
        handleStartInstant();
      }, 50);
    }
  };

  const loadMeetings = useCallback(async () => {
    if (!isLoggedIn) {
      setUpcoming([]);
      setRecent([]);
      setLoading(false);
      return;
    }
    try {
      setError('');
      setLoading(true);
      const [upcomingList, recentList] = await Promise.all([
        api.upcoming().catch(() => []),
        api.recent().catch(() => []),
      ]);
      setUpcoming(upcomingList);
      setRecent(recentList);
    } catch (e) {
      console.warn('Could not reach backend meetings endpoint:', e);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      setUpcoming([]);
      setRecent([]);
      setLoading(false);
    } else {
      loadMeetings();
    }
  }, [loadMeetings, isLoggedIn, user?.id]);

  // Start instant meeting
  const handleStartInstant = async () => {
    if (!isLoggedIn) {
      setAuthPromptConfig({
        title: 'Sign in to Start Meeting',
        subtitle: 'Please sign in or create an account to start an instant meeting and access your meeting history.',
      });
      setPendingAfterAuth('instant');
      setAuthModalOpen(true);
      return;
    }

    const curUser = getStoredUser();
    const hostName = curUser?.display_name || 'Sahil Dargar';
    try {
      setError('');
      const m = await api.instant();
      const joined = await api.join({
        meeting_id: m.meeting_id,
        display_name: hostName,
        is_host: true,
      });
      window.location.href = `/meeting/${m.meeting_id}?session=${joined.session_id}&name=${encodeURIComponent(hostName)}&host=true`;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not start meeting';
      setToast(msg);
    }
  };

  // Launch specific meeting by ID (e.g. scheduled or rejoin from recents)
  const handleStartMeetingById = async (id: string) => {
    const cleanId = id.replace(/\s+/g, '');
    const found = upcoming.find((m) => m.meeting_id === cleanId) || recent.find((m) => m.meeting_id === cleanId);
    if (found && isSeedMeeting(found)) {
      return; // Seed data: do nothing
    }

    const curUser = getStoredUser();
    const hostName = curUser?.display_name || 'Sahil Dargar';
    try {
      const joined = await api.join({
        meeting_id: cleanId,
        display_name: hostName,
      });
      window.location.href = `/meeting/${cleanId}?session=${joined.session_id}&name=${encodeURIComponent(hostName)}&host=${joined.is_host}`;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not join meeting';
      if (msg.toLowerCase().includes('ended')) {
        setToast('This meeting has ended and is no longer available.');
        loadMeetings();
        return;
      }
      setToast(msg);
    }
  };

  // Copy meeting invite
  const handleCopyMeeting = async (m: Meeting) => {
    if (isSeedMeeting(m)) return; // Seed data: do nothing
    try {
      const url = formatInviteUrl(m.invite_url, m.meeting_id, m.invite_token);
      await navigator.clipboard?.writeText(url);
      setToast('Meeting invitation link copied to clipboard');
    } catch {
      setToast('Could not copy link');
    }
  };

  // Copy custom invitation text
  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setToast('Invitation details copied to clipboard');
    } catch {
      setToast('Could not copy to clipboard');
    }
  };

  // Handle scheduled meeting success
  const handleScheduledSuccess = (_meeting: Meeting) => {
    setScheduleModalOpen(false);
    loadMeetings();
    setToast('Meeting scheduled successfully');
  };

  return (
    <div className="zoom-workplace-app">
      {/* 1. Zoom Workplace Top Bar */}
      <ZoomHeader
        onNavigateTab={(tab) => setActiveTab(tab as ZoomTab)}
      />

      {/* 2. Main Workspace Body (Rail + Content Pane) */}
      <div className="zoom-workplace-body">
        {/* Left Navigation Rail */}
        <ZoomNavRail
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        {/* Content View Router */}
        <main className="zoom-workplace-main">
          {activeTab === 'home' && (
            <HomeView
              onStartInstant={handleStartInstant}
              onOpenJoin={() => {
                setJoinDefaultId('');
                setJoinModalOpen(true);
              }}
              onOpenSchedule={handleOpenSchedule}
              onOpenRecordings={() => setRecordingsOpen(true)}
              onOpenSummaries={() => setSummariesOpen(true)}
              onOpenNotes={() => setNotesOpen(true)}
              upcomingMeetings={upcoming}
              recentMeetings={recent}
              onCopyMeeting={handleCopyMeeting}
              onJoinMeeting={(m) => {
                setJoinDefaultId(m.meeting_id);
                setJoinModalOpen(true);
              }}
            />
          )}

          {activeTab === 'meetings' && (
            <MeetingsView
              upcomingMeetings={upcoming}
              recentMeetings={recent}
              onRefresh={loadMeetings}
              onStartMeeting={handleStartMeetingById}
              onCopyText={handleCopyText}
              onOpenSchedule={handleOpenSchedule}
            />
          )}
        </main>
      </div>

      {/* 3. Modals & Dialogs */}

      {joinModalOpen && (
        <JoinModal
          defaultMeetingId={joinDefaultId}
          onClose={() => {
            setJoinModalOpen(false);
            setJoinDefaultId('');
          }}
        />
      )}

      {scheduleModalOpen && (
        <ScheduleModal
          onClose={() => setScheduleModalOpen(false)}
          onCreated={handleScheduledSuccess}
          onRequireAuth={handleOpenSchedule}
        />
      )}

      {/* Authentication Modal for Scheduling & User Actions */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setPendingAfterAuth(null);
        }}
        title={authPromptConfig.title}
        subtitle={authPromptConfig.subtitle}
        onSuccess={handleAuthSuccess}
      />

      <RecordingsModal
        isOpen={recordingsOpen}
        onClose={() => setRecordingsOpen(false)}
      />

      <SummariesModal
        isOpen={summariesOpen}
        onClose={() => setSummariesOpen(false)}
      />

      <NotesModal
        isOpen={notesOpen}
        onClose={() => setNotesOpen(false)}
      />

      {/* 4. Notification Toast */}
      {toast && (
        <Toast message={toast} onDismiss={() => setToast('')} />
      )}
    </div>
  );
}
