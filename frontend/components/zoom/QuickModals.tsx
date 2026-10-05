'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Download,
  Sparkles,
  CheckCircle2,
  Clock,
  Calendar,
  FileText,
  Search,
  Video,
  User,
  Hash,
  ArrowRight,
} from 'lucide-react';

/* =========================================================================
   1. Recordings Modal
   ========================================================================= */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RecordingsModal({ isOpen, onClose }: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const mockRecordings = [
    {
      id: 'rec-1',
      title: 'Sprint Planning & Architecture Sync',
      date: 'Yesterday, 3:30 PM',
      duration: '42 mins',
      size: '215 MB',
      type: 'Cloud Recording',
    },
    {
      id: 'rec-2',
      title: 'UI/UX Design Review — Zoom Workplace',
      date: 'Sep 29, 2026',
      duration: '28 mins',
      size: '140 MB',
      type: 'Cloud Recording',
    },
  ];

  return (
    <div className="zoom-modal-backdrop" onClick={onClose}>
      <div className="zoom-standard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="zoom-std-header">
          <div className="zoom-std-title-group">
            <span className="zoom-record-dot-icon">
              <span className="dot-inner" />
            </span>
            <h3>Cloud & Local Recordings</h3>
          </div>
          <button className="zoom-std-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="zoom-std-body">
          <div className="zoom-recordings-list">
            {mockRecordings.map((rec) => (
              <div key={rec.id} className="zoom-rec-item">
                <div className="rec-info">
                  <h4>{rec.title}</h4>
                  <div className="rec-meta">
                    <span><Calendar size={13} /> {rec.date}</span>
                    <span><Clock size={13} /> {rec.duration}</span>
                    <span className="rec-badge">{rec.size}</span>
                  </div>
                </div>
                <div className="rec-actions">
                  <button className="zoom-btn-outline sm" onClick={() => alert('Playing recording preview...')}>
                    <Play size={13} /> Play
                  </button>
                  <button className="zoom-btn-outline sm" onClick={() => alert('Download started')}>
                    <Download size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   2. Summaries Modal
   ========================================================================= */
export function SummariesModal({ isOpen, onClose }: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="zoom-modal-backdrop" onClick={onClose}>
      <div className="zoom-standard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="zoom-std-header">
          <div className="zoom-std-title-group">
            <Sparkles size={18} color="#0B5CFF" />
            <h3>AI Companion Summaries</h3>
          </div>
          <button className="zoom-std-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="zoom-std-body">
          <div className="zoom-summary-card">
            <div className="summary-card-header">
              <h4>Sprint Planning & Architecture Sync</h4>
              <span className="summary-date">Generated Yesterday</span>
            </div>

            <div className="summary-section">
              <h5>Executive Summary</h5>
              <p>
                The team aligned on the front-end overhaul of Zoom Workplace clone. Key priorities include
                delivering pixel-perfect navigation rails, digital clock with quick squircles, chat channels,
                and Personal Meeting ID management.
              </p>
            </div>

            <div className="summary-section">
              <h5>Key Action Items</h5>
              <ul className="summary-checklist">
                <li>
                  <CheckCircle2 size={15} color="#10B981" />
                  <span>Finalize high-fidelity CSS matching Zoom Workplace desktop and web theme</span>
                </li>
                <li>
                  <CheckCircle2 size={15} color="#10B981" />
                  <span>Verify WebRTC audio/video call room signaling and peer connectivity</span>
                </li>
                <li>
                  <CheckCircle2 size={15} color="#10B981" />
                  <span>Test modal interactions: Settings, Schedule, Join, and Search Ctrl+K</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   3. Notes Modal
   ========================================================================= */
export function NotesModal({ isOpen, onClose }: ModalProps) {
  const [noteContent, setNoteContent] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('zoom_my_notes') || '• Review agenda for 11:00 AM call\n• Share meeting link with design team\n• Test screen sharing & background blur';
    }
    return '';
  });

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNoteContent(e.target.value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('zoom_my_notes', e.target.value);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="zoom-modal-backdrop" onClick={onClose}>
      <div className="zoom-standard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="zoom-std-header">
          <div className="zoom-std-title-group">
            <FileText size={18} color="#0B5CFF" />
            <h3>My Notes</h3>
          </div>
          <button className="zoom-std-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="zoom-std-body">
          <p className="zoom-notes-sub">Auto-saved personal scratchpad for meetings & reminders.</p>
          <textarea
            className="zoom-notes-textarea"
            rows={10}
            value={noteContent}
            onChange={handleNoteChange}
            placeholder="Type your notes, ideas, or action items here..."
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   4. Search Modal (Ctrl+K)
   ========================================================================= */
interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (action: string) => void;
}

export function SearchModal({ isOpen, onClose, onSelectAction }: SearchModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const searchItems = [
    { type: 'action', title: 'Start Instant Meeting', sub: 'Launch your video room now', id: 'instant' },
    { type: 'action', title: 'Schedule a Meeting', sub: 'Set up a future room with calendar invite', id: 'schedule' },
    { type: 'action', title: 'Join a Meeting', sub: 'Enter a room by ID or URL link', id: 'join' },
    { type: 'action', title: 'Upcoming Meetings', sub: 'View all scheduled meetings and invites', id: 'meetings' },
    { type: 'action', title: 'Cloud & Local Recordings', sub: 'Review saved meeting recordings', id: 'recordings' },
    { type: 'action', title: 'AI Meeting Summaries', sub: 'Automated summaries and key takeaways', id: 'summaries' },
    { type: 'action', title: 'My Notes', sub: 'Auto-saved personal scratchpad', id: 'notes' },
  ];

  const filtered = searchItems.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.sub.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="zoom-modal-backdrop" onClick={onClose}>
      <div className="zoom-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="zoom-search-input-wrap">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search meetings, actions, or tools..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <kbd className="esc-badge">ESC</kbd>
        </div>

        <div className="zoom-search-results">
          {filtered.length === 0 ? (
            <div className="zoom-search-empty">No results found for "{query}"</div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="zoom-search-item"
                onClick={() => {
                  onSelectAction(item.id);
                  onClose();
                }}
              >
                <div className="item-icon-box">
                  {item.id === 'recordings' ? (
                    <Download size={16} color="#0B5CFF" />
                  ) : item.id === 'summaries' ? (
                    <Sparkles size={16} color="#0B5CFF" />
                  ) : item.id === 'notes' ? (
                    <FileText size={16} color="#0B5CFF" />
                  ) : item.id === 'meetings' ? (
                    <Calendar size={16} color="#0B5CFF" />
                  ) : (
                    <Video size={16} color="#0B5CFF" />
                  )}
                </div>
                <div className="item-text">
                  <strong>{item.title}</strong>
                  <span>{item.sub}</span>
                </div>
                <ArrowRight size={14} className="item-arrow" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
