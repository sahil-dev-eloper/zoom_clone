/**
 * Centralized API client for the FocusRoom backend.
 *
 * All HTTP calls go through `request()` which handles JSON parsing,
 * error extraction, and typed returns.
 */

import type {
  JoinPayload,
  JoinResult,
  KickPayload,
  Meeting,
  Participant,
  SchedulePayload,
} from '@/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.detail || `Request failed with status ${response.status}`
    );
  }

  return body;
}

export const api = {
  // ---- Dashboard ----
  upcoming: () => request<Meeting[]>('/api/meetings/upcoming'),
  recent: () => request<Meeting[]>('/api/meetings/recent'),

  // ---- Create ----
  instant: () =>
    request<Meeting>('/api/meetings/instant', { method: 'POST' }),

  schedule: (data: SchedulePayload) =>
    request<Meeting>('/api/meetings/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ---- Meeting details ----
  details: (id: string) => request<Meeting>(`/api/meetings/${id}`),

  // ---- Join / Leave / End ----
  join: (data: JoinPayload) =>
    request<JoinResult>('/api/meetings/join', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  leave: (id: string, session_id: string) =>
    request<{ ok: boolean }>(`/api/meetings/${id}/leave`, {
      method: 'POST',
      body: JSON.stringify({ session_id }),
    }),

  end: (id: string) =>
    request<Meeting>(`/api/meetings/${id}/end`, { method: 'POST' }),

  // ---- Participants ----
  participants: (id: string) =>
    request<Participant[]>(`/api/meetings/${id}/participants`),

  // ---- Host controls ----
  kick: (id: string, data: KickPayload) =>
    request<{ ok: boolean; removed: string }>(`/api/meetings/${id}/kick`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
