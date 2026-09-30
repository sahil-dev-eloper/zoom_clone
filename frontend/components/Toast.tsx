'use client';

import { Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  duration?: number;
  onDismiss: () => void;
}

export function Toast({ message, duration = 2500, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  if (!message) return null;

  return (
    <div className="toast">
      <Link2 size={14} />
      {message}
    </div>
  );
}
