/* Types for the FocusRoom meeting workspace. */

export interface Meeting {
  meeting_id: string;
  invite_token: string;
  title: string;
  description?: string;
  host_name: string;
  scheduled_time: string;
  duration_minutes: number;
  status: 'scheduled' | 'active' | 'ended';
  created_at: string;
  ended_at?: string | null;
  invite_url: string;
  participant_count: number;
  passcode?: string;
  is_seed?: boolean;
}

export interface Participant {
  id: number;
  display_name: string;
  is_host: boolean;
  joined_at: string;
  left_at?: string | null;
  session_id: string;
}

export interface JoinResult {
  meeting: Meeting;
  participant_id: number;
  session_id: string;
  is_host: boolean;
}

export interface SchedulePayload {
  title: string;
  description?: string;
  scheduled_time: string;
  duration_minutes: number;
}

export interface JoinPayload {
  meeting_id: string;
  display_name: string;
  session_id?: string;
  is_host?: boolean;
}

export interface KickPayload {
  host_session_id: string;
  participant_id: number;
}

export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

export const SEED_MEETING_TITLES = [
  'Product Design Sync',
  'Engineering Standup',
  'Client Strategy Review',
  'Design System Workshop',
  'Weekly Executive Sync',
  'Test Scheduled Sprint Review',
  'Sprint Retrospective',
  'Sprint 24 Retrospective',
  'Q3 Planning Room',
  'Product Architecture Review',
  'Marketing Debrief',
  'All-Hands Kickoff',
  "Sahil's Zoom Meeting",
];

export function isSeedMeeting(m?: Meeting | null): boolean {
  if (!m) return false;
  if (m.is_seed) return true;
  return SEED_MEETING_TITLES.some(
    (t) => t.toLowerCase() === m.title.trim().toLowerCase()
  );
}

