'use client';

import {
  CalendarDays,
  Home,
  LogIn,
  Settings,
  X,
} from 'lucide-react';
import { Brand } from './Brand';

interface SidebarProps {
  onJoin: () => void;
  onSchedule: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ onJoin, onSchedule, isOpen, onClose }: SidebarProps) {
  return (
    <>
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Brand />
          {onClose && (
            <button
              className="close mobile-close"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
          )}
        </div>

      <nav>
        <button className="nav-item active">
          <Home size={18} />
          Home
        </button>
        <button className="nav-item" onClick={onJoin}>
          <LogIn size={18} />
          Join meeting
        </button>
        <button className="nav-item" onClick={onSchedule}>
          <CalendarDays size={18} />
          Meetings
        </button>
      </nav>

      <div style={{ marginTop: 'auto' }}>
        <button className="nav-item">
          <Settings size={18} />
          Settings
        </button>

        <hr className="divider" style={{ margin: '12px 8px' }} />

        <div className="profile" style={{ padding: '0 12px' }}>
          <div className="avatar">AM</div>
          <div>
            <strong style={{ fontSize: 13 }}>Alex Morgan</strong>
            <small>Personal workspace</small>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}
