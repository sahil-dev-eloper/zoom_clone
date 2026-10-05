'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Plus,
  CalendarDays,
  Calendar,
  History,
  ChevronDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Clock,
  Copy,
  LogIn,
  Check,
} from 'lucide-react';
import { ParasolEmptyStateIllustration } from './Illustrations';
import type { Meeting } from '@/types';
import { isSeedMeeting } from '@/types';
import { useAuth } from '@/lib/auth';

interface HomeViewProps {
  onStartInstant: () => void;
  onOpenJoin: () => void;
  onOpenSchedule: () => void;
  onOpenRecordings?: () => void;
  onOpenSummaries?: () => void;
  onOpenNotes?: () => void;
  upcomingMeetings: Meeting[];
  recentMeetings?: Meeting[];
  onCopyMeeting: (meeting: Meeting) => void;
  onJoinMeeting: (meeting: Meeting) => void;
}

export function HomeView({
  onStartInstant,
  onOpenJoin,
  onOpenSchedule,
  onOpenRecordings,
  onOpenSummaries,
  onOpenNotes,
  upcomingMeetings,
  recentMeetings = [],
  onCopyMeeting,
  onJoinMeeting,
}: HomeViewProps) {
  // Live Clock & Date
  const [isMounted, setIsMounted] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [dayNumber, setDayNumber] = useState<number>(1);
  const [newMeetingDropdownOpen, setNewMeetingDropdownOpen] = useState(false);
  const [startWithVideo, setStartWithVideo] = useState(true);
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);

  // Selected date for calendar navigation
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const datePickerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
    const updateDateTime = () => {
      const now = new Date();
      // Format time: "10:29 AM"
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
      setTimeStr(`${formattedHours}:${formattedMinutes} ${ampm}`);

      // Format date: "Thursday, October 1"
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      };
      setDateStr(now.toLocaleDateString('en-US', options));
      setDayNumber(now.getDate());
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handlePrevDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return next;
    });
  };

  const handleNextDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  const handleGoToToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  };

  const isSelectedToday = (() => {
    const now = new Date();
    return (
      selectedDate.getDate() === now.getDate() &&
      selectedDate.getMonth() === now.getMonth() &&
      selectedDate.getFullYear() === now.getFullYear()
    );
  })();

  const isSelectedTomorrow = (() => {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return (
      selectedDate.getDate() === tom.getDate() &&
      selectedDate.getMonth() === tom.getMonth() &&
      selectedDate.getFullYear() === tom.getFullYear()
    );
  })();

  const isSelectedYesterday = (() => {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    return (
      selectedDate.getDate() === yest.getDate() &&
      selectedDate.getMonth() === yest.getMonth() &&
      selectedDate.getFullYear() === yest.getFullYear()
    );
  })();

  // Format short header date: e.g. "Today, Oct 5" or "Tomorrow, Oct 6" or "Wed, Oct 7"
  const shortDateHeader = (() => {
    if (!isMounted) return 'Today';
    const month = selectedDate.toLocaleDateString('en-US', { month: 'short' });
    const day = selectedDate.getDate();
    if (isSelectedToday) return `Today, ${month} ${day}`;
    if (isSelectedTomorrow) return `Tomorrow, ${month} ${day}`;
    if (isSelectedYesterday) return `Yesterday, ${month} ${day}`;
    const weekday = selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${weekday}, ${month} ${day}`;
  })();

  // Filter meetings for the selected date
  const filteredMeetings = upcomingMeetings.filter((m) => {
    try {
      const d = new Date(m.scheduled_time);
      return (
        d.getDate() === selectedDate.getDate() &&
        d.getMonth() === selectedDate.getMonth() &&
        d.getFullYear() === selectedDate.getFullYear()
      );
    } catch {
      return false;
    }
  });

  return (
    <div className="zoom-home-container">
      {/* 1. Big Digital Clock & Date */}
      <div className="zoom-clock-section">
        <div className="zoom-clock-time" suppressHydrationWarning>
          {timeStr || '10:29 AM'}
        </div>
        <div className="zoom-clock-date" suppressHydrationWarning>
          {dateStr || 'Thursday, October 1'}
        </div>
      </div>

      {/* 2. Three Big Hero Action Buttons */}
      <div className="zoom-hero-actions">
        {/* New Meeting */}
        <div className="zoom-action-wrapper">
          <button
            className="zoom-squircle-btn orange"
            onClick={onStartInstant}
            title="Start an instant meeting"
            aria-label="New meeting"
          >
            <Video size={28} color="#FFFFFF" strokeWidth={2.2} />
          </button>
          <div
            className="zoom-action-label-row"
            onClick={() => setNewMeetingDropdownOpen(!newMeetingDropdownOpen)}
          >
            <span>New meeting</span>
            <ChevronDown size={14} className="zoom-caret-icon" />
          </div>

          {newMeetingDropdownOpen && (
            <div className="zoom-dropdown-menu new-meeting-menu" onClick={(e) => e.stopPropagation()}>
              <label className="zoom-menu-check-item">
                <input
                  type="checkbox"
                  checked={startWithVideo}
                  onChange={(e) => setStartWithVideo(e.target.checked)}
                />
                <span>Start with video</span>
              </label>
            </div>
          )}
        </div>

        {/* Join */}
        <div className="zoom-action-wrapper">
          <button
            className="zoom-squircle-btn blue"
            onClick={onOpenJoin}
            title="Join a meeting by ID or link"
            aria-label="Join meeting"
          >
            <Plus size={30} color="#FFFFFF" strokeWidth={2.4} />
          </button>
          <div className="zoom-action-label-row" onClick={onOpenJoin}>
            <span>Join</span>
          </div>
        </div>

        {/* Schedule */}
        <div className="zoom-action-wrapper">
          <button
            className="zoom-squircle-btn blue"
            onClick={onOpenSchedule}
            title="Schedule a future meeting"
            aria-label="Schedule meeting"
          >
            <div className="zoom-cal-icon-inner">
              <CalendarDays size={24} color="#FFFFFF" strokeWidth={2} />
              <span className="zoom-cal-day-num">{dayNumber || 1}</span>
            </div>
          </button>
          <div className="zoom-action-label-row" onClick={onOpenSchedule}>
            <span>Schedule</span>
          </div>
        </div>
      </div>

      {/* Calendar & Scheduled Meetings Container Card */}
      <div className="zoom-calendar-card">
        {/* Hidden date picker input for direct date selection */}
        <input
          ref={datePickerInputRef}
          type="date"
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
          value={isMounted ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}` : ''}
          suppressHydrationWarning
          onChange={(e) => {
            if (e.target.value) {
              const [y, m, d] = e.target.value.split('-').map(Number);
              setSelectedDate(new Date(y, m - 1, d));
            }
          }}
        />

        {/* Card Header */}
        <div className="zoom-calendar-header">
          <div
            className="zoom-calendar-title-group"
            onClick={() => {
              try {
                datePickerInputRef.current?.showPicker();
              } catch {
                // fallback
              }
            }}
            title="Click to pick a specific date"
          >
            <span className="zoom-calendar-title" suppressHydrationWarning>{shortDateHeader}</span>
            <ChevronDown size={15} className="zoom-calendar-caret" />
          </div>
          <button
            className="zoom-icon-btn subtle"
            title="Expand Calendar"
            onClick={onOpenSchedule}
          >
            <ExternalLink size={15} />
          </button>
        </div>

        {/* Card Subheader Toolbar */}
        <div className="zoom-calendar-subbar">
          <div className="zoom-calendar-nav-group">
            <button
              type="button"
              className={`zoom-today-pill ${isMounted && isSelectedToday ? 'active' : ''}`}
              onClick={handleGoToToday}
              title="Go to Today"
              suppressHydrationWarning
            >
              Today
            </button>
            <button
              type="button"
              className="zoom-sub-arrow"
              title="Previous day"
              onClick={handlePrevDay}
              aria-label="Previous day"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="zoom-sub-arrow"
              title="Next day"
              onClick={handleNextDay}
              aria-label="Next day"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="zoom-sub-more"
              title="More options"
              onClick={() => setCalendarMenuOpen(!calendarMenuOpen)}
            >
              <MoreHorizontal size={16} />
            </button>
            {calendarMenuOpen && (
              <div
                className="zoom-dropdown-menu"
                style={{ right: 0, top: 28, minWidth: 160 }}
                onClick={() => setCalendarMenuOpen(false)}
              >
                <div className="zoom-menu-row" onClick={handleGoToToday}>
                  <CalendarDays size={14} />
                  <span>Go to Today</span>
                </div>
                <div className="zoom-menu-row" onClick={onOpenSchedule}>
                  <Plus size={14} />
                  <span>Schedule Meeting</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card Body */}
        <div className="zoom-calendar-body">
          {filteredMeetings.length === 0 ? (
            <div className="zoom-empty-calendar-state">
              <ParasolEmptyStateIllustration className="zoom-parasol-art" />
              <p className="zoom-empty-caption">
                {isSelectedToday
                  ? 'No meetings scheduled.'
                  : `No meetings scheduled for ${shortDateHeader}.`}
              </p>
            </div>
          ) : (
            <div className="zoom-scheduled-list">
              {filteredMeetings.map((m) => {
                const startTime = new Date(m.scheduled_time).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <div key={m.meeting_id} className="zoom-scheduled-item">
                    <div className="zoom-scheduled-time-badge">
                      <Clock size={14} />
                      <span>{startTime}</span>
                    </div>
                    <div className="zoom-scheduled-info">
                      <h4>{m.title}</h4>
                      <p>Meeting ID: {m.meeting_id} • {m.duration_minutes ? `${m.duration_minutes} min` : 'N/A'}</p>
                    </div>
                    <div className="zoom-scheduled-actions">
                      <button
                        className="zoom-btn-outline sm"
                        onClick={() => {
                          if (isSeedMeeting(m)) return;
                          onCopyMeeting(m);
                        }}
                        title="Copy Invitation"
                      >
                        <Copy size={13} />
                        <span>Copy</span>
                      </button>
                      <button
                        className="zoom-btn-primary sm"
                        onClick={() => {
                          if (isSeedMeeting(m)) return;
                          onJoinMeeting(m);
                        }}
                      >
                        <LogIn size={13} />
                        <span>Join</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
