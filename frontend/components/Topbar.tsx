'use client';

import { Menu } from 'lucide-react';

function getDateString(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="topbar">
      <button
        className="menu-btn"
        aria-label="Toggle navigation menu"
        onClick={onMenuClick}
      >
        <Menu size={20} />
      </button>

      <div className="profile">
        <span style={{ fontSize: 13, color: 'var(--muted)' }} suppressHydrationWarning>
          {getDateString()}
        </span>
        <div className="avatar">SD</div>
      </div>
    </header>
  );
}
