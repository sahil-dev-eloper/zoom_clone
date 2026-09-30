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
}

export interface KickPayload {
  host_session_id: string;
  participant_id: number;
}
