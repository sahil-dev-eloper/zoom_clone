'use client';

import React, { useState } from 'react';
import {
  RotateCw,
  Copy,
  Calendar,
  Clock,
  Check,
  Plus,
  Video,
  History,
  ChevronLeft,
} from 'lucide-react';
import type { Meeting } from '@/types';
import { isSeedMeeting } from '@/types';

interface MeetingsViewProps {
  upcomingMeetings: Meeting[];
  recentMeetings?: Meeting[];
  onRefresh: () => void;
  onStartMeeting: (meetingId: string) => void;
  onCopyText: (text: string) => void;
  onOpenSchedule: () => void;
}

export function MeetingsView({
  upcomingMeetings,
  recentMeetings = [],
  onRefresh,
  onStartMeeting,
  onCopyText,
  onOpenSchedule,
}: MeetingsViewProps) {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'recent'>('upcoming');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(() => {
    return upcomingMeetings[0]?.meeting_id || recentMeetings[0]?.meeting_id || '';
  });
  const [showInvitation, setShowInvitation] = useState(false);
  const [copied, setCopied] = useState(false);

  // Active list based on selected tab
  const currentList = activeTab === 'upcoming' ? upcomingMeetings : recentMeetings;

  // Selected meeting resolved from current list (fallback to first item or null)
  const selectedMeeting =
    currentList.find((m) => m.meeting_id === selectedMeetingId) ||
    currentList[0] ||
    null;

  const handleSelectTab = (tab: 'upcoming' | 'recent') => {
    setActiveTab(tab);
    setShowInvitation(false);
    const list = tab === 'upcoming' ? upcomingMeetings : recentMeetings;
    if (list.length > 0) {
      setSelectedMeetingId(list[0].meeting_id);
    } else {
      setSelectedMeetingId('');
    }
  };

  const getFullInvitationText = () => {
    if (!selectedMeeting) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const timeStr = new Date(selectedMeeting.scheduled_time).toLocaleString();
    return `${selectedMeeting.host_name || 'Host'} is inviting you to a scheduled Zoom meeting.

Topic: ${selectedMeeting.title}
Time: ${timeStr}

Join Zoom Meeting
${selectedMeeting.invite_url || `${origin}/join?meeting=${selectedMeeting.meeting_id}`}

Meeting ID: ${selectedMeeting.meeting_id}
Passcode: ${selectedMeeting.invite_token || '123456'}`;
  };

  // Check if selected meeting is demo seed data
  const isSeed = isSeedMeeting(selectedMeeting);

  const handleCopy = () => {
    if (isSeed) return; // Seed data: clicking copy invitation does nothing
    const text = getFullInvitationText();
    if (text) {
      onCopyText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`zoom-meetings-layout mobile-view-${mobileView}`}>
      {/* Left Meetings Sidebar Pane */}
      <div className="zoom-meetings-sidebar">
        {/* Top Header */}
        <div className="zoom-meetings-header">
          <button
            className="zoom-refresh-btn"
            onClick={onRefresh}
            title="Refresh meetings"
            aria-label="Refresh meetings"
          >
            <RotateCw size={15} />
          </button>
          <span className="zoom-meetings-header-title">Meetings</span>
          <button
            className="zoom-refresh-btn"
            onClick={onOpenSchedule}
            title="Schedule a new meeting"
            aria-label="Schedule meeting"
            style={{ marginLeft: 'auto' }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Feature Buttons: Upcoming & Recent Toggle */}
        <div className="zoom-meetings-tab-toggle">
          <button
            type="button"
            className={`zoom-meetings-tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`}
            onClick={() => handleSelectTab('upcoming')}
          >
            <Calendar size={13} />
            <span>Upcoming ({upcomingMeetings.length})</span>
          </button>
          <button
            type="button"
            className={`zoom-meetings-tab-btn ${activeTab === 'recent' ? 'active' : ''}`}
            onClick={() => handleSelectTab('recent')}
          >
            <History size={13} />
            <span>Recent ({recentMeetings.length})</span>
          </button>
        </div>

        {/* Meetings List */}
        <div className="zoom-meetings-list">
          {activeTab === 'upcoming' ? (
            upcomingMeetings.length === 0 ? (
              <div className="zoom-meetings-empty" style={{ padding: '32px 16px', textAlign: 'center' }}>
                <Calendar size={28} color="#94A3B8" style={{ margin: '0 auto 10px' }} />
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#475569' }}>No upcoming meetings</p>
                <small style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginTop: 4 }}>
                  Schedule a meeting to plan your next discussion.
                </small>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14, fontSize: 12, padding: '6px 14px' }}
                  onClick={onOpenSchedule}
                >
                  Schedule Meeting
                </button>
              </div>
            ) : (
              <div className="zoom-upcoming-sublist">
                {upcomingMeetings.map((m) => {
                  const startTime = new Date(m.scheduled_time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const isSelected = selectedMeeting?.meeting_id === m.meeting_id;
                  return (
                    <div
                      key={m.meeting_id}
                      className={`zoom-upcoming-item ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedMeetingId(m.meeting_id);
                        setMobileView('detail');
                      }}
                    >
                      <div className="item-time">
                        <Clock size={13} />
                        <span>{startTime}</span>
                      </div>
                      <div className="item-title">{m.title}</div>
                      <div className="item-sub">ID: {m.meeting_id}</div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            recentMeetings.length === 0 ? (
              <div className="zoom-meetings-empty" style={{ padding: '32px 16px', textAlign: 'center' }}>
                <History size={28} color="#94A3B8" style={{ margin: '0 auto 10px' }} />
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#475569' }}>No recent meetings</p>
                <small style={{ color: '#94A3B8', fontSize: 12, display: 'block', marginTop: 4 }}>
                  Meetings will appear here as past history records once held.
                </small>
              </div>
            ) : (
              <div className="zoom-upcoming-sublist">
                {recentMeetings.map((m) => {
                  const isActive = m.status === 'active';
                  const dateObj = new Date(m.ended_at || m.scheduled_time);
                  const dateStr = dateObj.toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  });
                  const timeStr = dateObj.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const isSelected = selectedMeeting?.meeting_id === m.meeting_id;
                  return (
                    <div
                      key={m.meeting_id}
                      className={`zoom-upcoming-item ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedMeetingId(m.meeting_id);
                        setMobileView('detail');
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <div className="item-time" style={{ color: isActive ? '#15803D' : '#64748B' }}>
                          <Clock size={12} />
                          <span>{isActive ? 'In Progress' : `${dateStr}, ${timeStr}`}</span>
                        </div>
                        {isActive ? (
                          <span className="zoom-recent-active-badge">
                            <span className="zoom-live-dot" />
                            In Progress
                          </span>
                        ) : (
                          <span className="zoom-recent-ended-badge">Ended</span>
                        )}
                      </div>
                      <div className="item-title">{m.title}</div>
                      <div className="item-sub">
                        {m.duration_minutes ? `${m.duration_minutes} mins • ` : 'Duration: N/A • '}ID: {m.meeting_id}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Bottom Add Calendar link */}
        <div className="zoom-add-calendar-box">
          <button
            className="zoom-add-calendar-link"
            onClick={onOpenSchedule}
          >
            <Calendar size={15} />
            <span>Schedule a meeting</span>
          </button>
        </div>
      </div>

      {/* Right Meeting Detail Pane */}
      <div className="zoom-meetings-main">
        {/* Mobile Back Button */}
        <div className="zoom-meetings-mobile-back-row">
          <button
            type="button"
            className="zoom-mobile-back-btn"
            onClick={() => setMobileView('list')}
            aria-label="Back to meetings list"
          >
            <ChevronLeft size={16} />
            <span>Back to {activeTab === 'upcoming' ? 'Upcoming' : 'Recent'}</span>
          </button>
        </div>

        {selectedMeeting ? (
          activeTab === 'recent' ? (
            /* RECENT MEETINGS: Pure History Record / Rejoin only if still in progress */
            <div className="zoom-meeting-details">
              <h1 className="zoom-detail-title">{selectedMeeting.title}</h1>
              <div className="zoom-detail-id">Meeting ID: {selectedMeeting.meeting_id}</div>

              {selectedMeeting.description && (
                <p style={{ color: '#475569', fontSize: 14, margin: '-12px 0 20px', lineHeight: 1.5 }}>
                  {selectedMeeting.description}
                </p>
              )}

              {selectedMeeting.status === 'active' ? (
                /* Meeting is still active / host is conducting it -> Allow rejoining directly! */
                <>
                  <div className="zoom-recent-active-banner">
                    <span className="zoom-live-dot-lg" />
                    <div>
                      <strong>Meeting In Progress</strong>
                      <p>The host is currently conducting this meeting. If you exited by mistake, you can rejoin directly.</p>
                    </div>
                  </div>

                  <div className="zoom-detail-actions">
                    <button
                      className="zoom-btn-primary pill"
                      onClick={() => onStartMeeting(selectedMeeting.meeting_id)}
                    >
                      Rejoin Meeting
                    </button>
                  </div>
                </>
              ) : (
                /* Meeting has ended -> Pure historical record (NO restart, NO invitation link) */
                <>
                  <div
                    className="zoom-meeting-meta-badge"
                    style={{ background: '#F1F5F9', color: '#475569' }}
                  >
                    <Clock size={14} />
                    <span>
                      Held on {new Date(selectedMeeting.ended_at || selectedMeeting.scheduled_time).toLocaleString()} • {selectedMeeting.duration_minutes ? `${selectedMeeting.duration_minutes} mins` : 'N/A'}
                    </span>
                  </div>

                  <div className="zoom-meeting-history-card">
                    <div className="zoom-history-row">
                      <span className="zoom-history-label">Status</span>
                      <span className="zoom-recent-ended-badge">Ended (Past Record)</span>
                    </div>
                    <div className="zoom-history-row">
                      <span className="zoom-history-label">Host</span>
                      <span className="zoom-history-val">{selectedMeeting.host_name || 'Sahil Dargar'}</span>
                    </div>
                    <div className="zoom-history-row">
                      <span className="zoom-history-label">Date & Time</span>
                      <span className="zoom-history-val">
                        {new Date(selectedMeeting.ended_at || selectedMeeting.scheduled_time).toLocaleString()}
                      </span>
                    </div>
                    <div className="zoom-history-row">
                      <span className="zoom-history-label">Duration</span>
                      <span className="zoom-history-val">{selectedMeeting.duration_minutes ? `${selectedMeeting.duration_minutes} minutes` : 'N/A'}</span>
                    </div>
                    <div className="zoom-history-row">
                      <span className="zoom-history-label">Meeting ID</span>
                      <span className="zoom-history-val">{selectedMeeting.meeting_id}</span>
                    </div>
                  </div>

                  <p className="zoom-history-notice">
                    This meeting has ended and is preserved as a history record. It cannot be restarted and invitation links are expired.
                  </p>
                </>
              )}
            </div>
          ) : (
            /* UPCOMING MEETINGS: Start & Share Invitation */
            <div className="zoom-meeting-details">
              <h1 className="zoom-detail-title">{selectedMeeting.title}</h1>
              <div className="zoom-detail-id">Meeting ID: {selectedMeeting.meeting_id}</div>

              {selectedMeeting.description && (
                <p style={{ color: '#475569', fontSize: 14, margin: '-12px 0 20px', lineHeight: 1.5 }}>
                  {selectedMeeting.description}
                </p>
              )}

              <div className="zoom-meeting-meta-badge">
                <Clock size={14} />
                <span>
                  {new Date(selectedMeeting.scheduled_time).toLocaleString()} • {selectedMeeting.duration_minutes ? `${selectedMeeting.duration_minutes} mins` : 'N/A'}
                </span>
              </div>

              {/* Action Buttons Row */}
              <div className="zoom-detail-actions">
                <button
                  className="zoom-btn-primary pill"
                  onClick={() => {
                    if (isSeed) return; // Seed data: clicking start does nothing
                    onStartMeeting(selectedMeeting.meeting_id);
                  }}
                >
                  Start
                </button>
                <button
                  className="zoom-btn-outline pill"
                  onClick={handleCopy}
                >
                  {copied ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy Invitation'}</span>
                </button>
              </div>

              {/* Expandable Invitation Link */}
              <div className="zoom-invitation-toggle-wrap">
                <button
                  className="zoom-invitation-toggle-btn"
                  onClick={() => setShowInvitation(!showInvitation)}
                >
                  {showInvitation ? 'Hide Meeting Invitation' : 'Show Meeting Invitation'}
                </button>

                {showInvitation && (
                  <div className="zoom-invitation-preview-card">
                    <div className="zoom-invite-text">
                      <p>{selectedMeeting.host_name || 'Host'} is inviting you to a scheduled Zoom meeting.</p>
                      <br />
                      <p><strong>Topic:</strong> {selectedMeeting.title}</p>
                      <p><strong>Time:</strong> {new Date(selectedMeeting.scheduled_time).toLocaleString()}</p>
                      <p><strong>Meeting ID:</strong> {selectedMeeting.meeting_id}</p>
                      <p><strong>Passcode:</strong> {selectedMeeting.invite_token || '123456'}</p>
                      <br />
                      <p>
                        <strong>Invite Link:</strong>{' '}
                        <span className="invite-link-url">{selectedMeeting.invite_url}</span>
                      </p>
                    </div>
                    <div className="zoom-invite-copy-footer">
                      <button className="zoom-btn-outline sm" onClick={handleCopy}>
                        <Copy size={13} />
                        <span>Copy Invitation</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#94A3B8', textAlign: 'center', padding: 32 }}>
            <div>
              <Video size={48} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
              <h3 style={{ fontSize: 18, color: '#334155', marginBottom: 6 }}>
                {activeTab === 'recent' ? 'No Recent Meeting Selected' : 'No Meeting Selected'}
              </h3>
              <p style={{ fontSize: 13, maxWidth: 320, margin: '0 auto 18px' }}>
                {activeTab === 'recent'
                  ? 'Select a meeting from the recent history list to view its recorded details.'
                  : 'Select a scheduled meeting from the left list or schedule a new one anytime.'}
              </p>
              {activeTab === 'upcoming' && (
                <button className="btn btn-primary" onClick={onOpenSchedule}>
                  Schedule Meeting
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
