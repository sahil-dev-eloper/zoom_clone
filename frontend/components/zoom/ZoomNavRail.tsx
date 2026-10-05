'use client';

import React from 'react';
import {
  Home,
  Video,
} from 'lucide-react';

export type ZoomTab = 'home' | 'meetings';

interface ZoomNavRailProps {
  activeTab: ZoomTab;
  onSelectTab: (tab: ZoomTab) => void;
}

export function ZoomNavRail({
  activeTab,
  onSelectTab,
}: ZoomNavRailProps) {
  const navItems = [
    {
      id: 'home' as ZoomTab,
      label: 'Home',
      icon: Home,
    },
    {
      id: 'meetings' as ZoomTab,
      label: 'Meetings',
      icon: Video,
    },
  ];

  return (
    <nav className="zoom-nav-rail" aria-label="Main Navigation">
      <div className="zoom-nav-rail-top">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`zoom-rail-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
            >
              <div className="zoom-rail-icon-box">
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              </div>
              <span className="zoom-rail-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
