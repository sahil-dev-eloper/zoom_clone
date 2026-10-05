'use client';

import { Video } from 'lucide-react';

interface BrandProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md';
}

export function Brand({ variant = 'light', size = 'md' }: BrandProps) {
  return (
    <div
      className="brand"
      style={
        variant === 'dark'
          ? { color: '#e2e8f0', padding: 0, marginBottom: 0 }
          : undefined
      }
    >
      <span
        className="brand-mark"
        style={
          variant === 'dark'
            ? {
                background: 'rgba(37, 99, 235, 0.2)',
                color: '#60a5fa',
                width: size === 'sm' ? 28 : 34,
                height: size === 'sm' ? 28 : 34,
              }
            : {
                width: size === 'sm' ? 28 : 34,
                height: size === 'sm' ? 28 : 34,
              }
        }
      >
        <Video size={size === 'sm' ? 14 : 16} />
      </span>
      <span style={{ fontSize: size === 'sm' ? 18 : 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#0B5CFF' }}>zoom</span>
      <span style={{ fontSize: size === 'sm' ? 14 : 17, fontWeight: 600, letterSpacing: '-0.02em', color: variant === 'dark' ? '#F8FAFC' : '#111827', marginLeft: 4 }}>Workplace</span>
    </div>
  );
}
