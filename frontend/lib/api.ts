/**
 * Centralized API client for the FocusRoom backend.
 *
 * All HTTP calls go through `request()` which handles JSON parsing,
 * error extraction, and typed returns.
 */

import type {
  AuthResult,
  AuthUser,
  JoinPayload,
  JoinResult,
  KickPayload,
  Meeting,
  Participant,
  SchedulePayload,
} from '@/types';

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1';

    // Support local multi-device testing over LAN (e.g. 192.168.x.x, 10.x.x.x)
    const isLanIp =
      /^192\.168\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      hostname.endsWith('.local');

    if (isLanIp) {
      return `http://${hostname}:8000`;
    }

    if (!isLocalhost) {
      if (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
        return 'https://zoomclonebe.onrender.com';
      }
    }
  }
  return (envUrl || 'http://localhost:8000').replace(/\/+$/, '');
}

export function getWsBaseUrl(meetingId: string): string {
  const customWs = process.env.NEXT_PUBLIC_WS_URL;
  if (customWs) {
    return `${customWs.replace(/\/+$/, '')}/ws/meetings/${meetingId}`;
  }
  const apiBase = getApiBaseUrl();
  const host = apiBase.replace(/^https?:\/\//, '');
  const wsProto =
    apiBase.startsWith('https://') ||
    (typeof window !== 'undefined' && window.location.protocol === 'https:')
      ? 'wss://'
      : 'ws://';
  return `${wsProto}${host}/ws/meetings/${meetingId}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> || {}),
  };

  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('zoom_auth_token');
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${base}${cleanPath}`, {
    ...init,
    headers,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.detail || `Request failed with status ${response.status}`
    );
  }

  return body;
}

export function formatInviteUrl(
  inviteUrl?: string,
  meetingId?: string,
  token?: string
): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    let cleanId = (meetingId || '').replace(/\s+/g, '');
    if (!cleanId && inviteUrl) {
      const match = inviteUrl.match(/meeting[=/]([a-zA-Z0-9_-]+)/);
      if (match) cleanId = match[1];
    }
    if (cleanId) {
      return `${origin}/join?meeting=${cleanId}${token ? `&token=${token}` : ''}`;
    }
  }
  return inviteUrl || '';
}

export function sanitizeMeeting(m: Meeting): Meeting {
  if (!m) return m;
  return {
    ...m,
    invite_url: formatInviteUrl(m.invite_url, m.meeting_id, m.invite_token),
  };
}

export function saveRecentMeetingId(meetingId: string) {
  if (typeof window === 'undefined' || !meetingId) return;
  try {
    const cleanId = meetingId.replace(/\s+/g, '');
    const raw = localStorage.getItem('zoom_recent_meeting_ids') || '[]';
    const list: string[] = JSON.parse(raw);
    const filtered = list.filter((id) => id !== cleanId);
    filtered.unshift(cleanId);
    localStorage.setItem('zoom_recent_meeting_ids', JSON.stringify(filtered.slice(0, 20)));
  } catch {}
}

export function getRecentMeetingIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('zoom_recent_meeting_ids') || '[]';
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveHostedMeetingId(meetingId: string) {
  if (typeof window === 'undefined' || !meetingId) return;
  try {
    const cleanId = meetingId.replace(/\s+/g, '');
    const raw = localStorage.getItem('zoom_hosted_meeting_ids') || '[]';
    const list: string[] = JSON.parse(raw);
    if (!list.includes(cleanId)) {
      list.unshift(cleanId);
      localStorage.setItem('zoom_hosted_meeting_ids', JSON.stringify(list.slice(0, 50)));
    }
  } catch {}
}

export function isHostedMeetingId(meetingId: string): boolean {
  if (typeof window === 'undefined' || !meetingId) return false;
  try {
    const cleanId = meetingId.replace(/\s+/g, '');
    const raw = localStorage.getItem('zoom_hosted_meeting_ids') || '[]';
    const list: string[] = JSON.parse(raw);
    return list.includes(cleanId);
  } catch {
    return false;
  }
}

export const api = {
  // ---- Dashboard ----
  upcoming: async () => {
    const list = await request<Meeting[]>('/api/meetings/upcoming');
    return list.map(sanitizeMeeting);
  },
  recent: async () => {
    const recentIds = getRecentMeetingIds();
    const query = recentIds.length > 0 ? `?meeting_ids=${encodeURIComponent(recentIds.join(','))}` : '';
    const list = await request<Meeting[]>(`/api/meetings/recent${query}`);
    return list.map(sanitizeMeeting);
  },

  // ---- Create ----
  instant: async () => {
    const m = await request<Meeting>('/api/meetings/instant', { method: 'POST' });
    if (m?.meeting_id) {
      saveRecentMeetingId(m.meeting_id);
      saveHostedMeetingId(m.meeting_id);
    }
    return sanitizeMeeting(m);
  },

  schedule: async (data: SchedulePayload) => {
    const m = await request<Meeting>('/api/meetings/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (m?.meeting_id) {
      saveRecentMeetingId(m.meeting_id);
      saveHostedMeetingId(m.meeting_id);
    }
    return sanitizeMeeting(m);
  },

  // ---- Meeting details ----
  details: async (id: string) => {
    const m = await request<Meeting>(`/api/meetings/${id}`);
    return sanitizeMeeting(m);
  },

  // ---- Join / Leave / End ----
  join: async (data: JoinPayload) => {
    const result = await request<JoinResult>('/api/meetings/join', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (result.meeting?.meeting_id) {
      saveRecentMeetingId(result.meeting.meeting_id);
    }
    return {
      ...result,
      meeting: sanitizeMeeting(result.meeting),
    };
  },

  leave: (id: string, session_id: string) =>
    request<{ ok: boolean }>(`/api/meetings/${id}/leave`, {
      method: 'POST',
      body: JSON.stringify({ session_id }),
    }),

  end: async (id: string) => {
    const m = await request<Meeting>(`/api/meetings/${id}/end`, { method: 'POST' });
    return sanitizeMeeting(m);
  },

  // ---- Participants ----
  participants: (id: string) =>
    request<Participant[]>(`/api/meetings/${id}/participants`),

  // ---- ICE servers ----
  iceServers: () =>
    request<{ iceServers: RTCIceServer[] }>('/api/ice-servers').catch(() => ({
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun.cloudflare.com:3478',
          ],
        },
      ],
    })),

  // ---- Host controls ----
  kick: (id: string, data: KickPayload) =>
    request<{ ok: boolean; removed: string }>(`/api/meetings/${id}/kick`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ---- Authentication ----
  auth: {
    login: (email: string, password: string) =>
      request<AuthResult>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (email: string, password: string, display_name: string) =>
      request<AuthResult>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, display_name }),
      }),
    me: () => request<AuthUser>('/api/auth/me'),
    updateProfile: (display_name: string) =>
      request<AuthUser>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ display_name }),
      }),
  },
};
