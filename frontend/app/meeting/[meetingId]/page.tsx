'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  Share2,
  Users,
  Video,
  VideoOff,
  Volume2,
  UserX,
  AlertTriangle,
  LoaderCircle,
  Monitor,
  LogIn,
  Check,
  ShieldCheck,
  Sparkles,
  LayoutGrid,
  ChevronUp,
  X,
  MoreHorizontal,
  Heart,
} from 'lucide-react';

import { api, formatInviteUrl, getApiBaseUrl, getWsBaseUrl } from '@/lib/api';
import type { Meeting, Participant, AuthUser } from '@/types';
import { getStoredUser } from '@/lib/auth';
import { Brand } from '@/components/Brand';
import { ZoomHeader } from '@/components/zoom/ZoomHeader';
import { ZoomNavRail } from '@/components/zoom/ZoomNavRail';
import { SettingsModal } from '@/components/zoom/SettingsModal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitial(name: string): string {
  return (name || 'G').charAt(0).toUpperCase();
}

function useSearchParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 10,
};

function getMediaSender(pc: RTCPeerConnection, kind: 'audio' | 'video'): RTCRtpSender | null {
  const transceivers = pc.getTransceivers();
  const match = transceivers.find((t) => t.receiver.track.kind === kind || t.sender.track?.kind === kind);
  if (match) return match.sender;
  const senders = pc.getSenders();
  const senderMatch = senders.find((s) => s.track?.kind === kind);
  return senderMatch || null;
}

// ---------------------------------------------------------------------------
// Zooom Meeting Room Page
// ---------------------------------------------------------------------------

export default function MeetingRoomPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = use(params);

  // Query params
  const query = useSearchParams();
  const queryName = query.get('name') || '';
  const initialSession = query.get('session') || '';
  const initialHost = query.get('host') === 'true';

  // Session & Identity State
  const defaultInitialName = queryName || (initialHost ? 'Sahil Dargar' : '');
  const [displayName, setDisplayName] = useState(defaultInitialName);
  const [sessionId, setSessionId] = useState(initialSession);
  const [isHost, setIsHost] = useState(initialHost);
  const [joinPromptName, setJoinPromptName] = useState(defaultInitialName);
  const [clientUser, setClientUser] = useState<AuthUser | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Hydrate client storedUser safely on mount
  useEffect(() => {
    setIsMounted(true);
    const stored = getStoredUser();
    if (stored) {
      setClientUser(stored);
      setDisplayName((prev) => prev || stored.display_name);
      setJoinPromptName((prev) => prev || stored.display_name);
    }
  }, []);

  // Zoom Workplace In-Meeting UI State
  const [infoPopupOpen, setInfoPopupOpen] = useState(false);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [videoMenuOpen, setVideoMenuOpen] = useState(false);
  const [reactMenuOpen, setReactMenuOpen] = useState(false);
  const [hostMenuOpen, setHostMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelType, setPanelType] = useState<'participants' | null>(null);
  const [viewMode, setViewMode] = useState<'speaker' | 'gallery'>('speaker');
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; left: number }[]>([]);

  // Meeting State
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [people, setPeople] = useState<Participant[]>([]);
  const [muted, setMuted] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [kicked, setKicked] = useState(false);
  const [hasLoadedInitialParticipants, setHasLoadedInitialParticipants] = useState(false);
  const [muteNotice, setMuteNotice] = useState('');

  // Voice Activity & Audio Meter State
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [localVolume, setLocalVolume] = useState(0);
  const [peerSpeaking, setPeerSpeaking] = useState<Record<string, boolean>>({});
  const [peerMediaState, setPeerMediaState] = useState<Record<string, { video: boolean; audio: boolean }>>({});
  const [streamVersion, setStreamVersion] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // WebRTC remote streams keyed by peerId (sessionId)
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  // Refs
  const rtcConfigRef = useRef<RTCConfiguration>(DEFAULT_RTC_CONFIG);
  const peerNamesRef = useRef<Record<string, string>>({});
  const loadParticipantsRef = useRef<() => Promise<void>>(async () => {});
  const hasLoadedInitialParticipantsRef = useRef(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const remoteMediaStreamsRef = useRef<Record<string, MediaStream>>({});
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Web Audio Context & Analyser Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalysersRef = useRef<Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>>(new Map());
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref mirrors for media states to avoid tearing down WebSocket on media toggles
  const cameraOnRef = useRef(cameraOn);
  cameraOnRef.current = cameraOn;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  // Load configured STUN/TURN ICE servers on mount
  useEffect(() => {
    api.iceServers().then((res) => {
      if (res?.iceServers && res.iceServers.length > 0) {
        console.log('[Zooom WebRTC] Received ICE servers from backend:', res.iceServers);
        rtcConfigRef.current = {
          iceServers: res.iceServers,
          iceCandidatePoolSize: 10,
        };
      }
    }).catch((err) => {
      console.warn('[Zooom WebRTC] Using fallback ICE servers:', err);
    });
  }, []);

  // ---- AudioContext Helper ----

  const getOrCreateAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
      }
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Global user gesture handler to unblock audio autoplay
  const handleUserGesture = useCallback(() => {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    remoteAudioRefs.current.forEach((el) => {
      el.play().catch(() => {});
    });
    setAudioBlocked(false);
  }, [getOrCreateAudioContext]);

  useEffect(() => {
    window.addEventListener('click', handleUserGesture);
    window.addEventListener('keydown', handleUserGesture);
    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
    };
  }, [handleUserGesture]);

  // Keep remote video and audio elements active and bound to streams
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      const vEl = remoteVideoRefs.current.get(peerId);
      if (vEl && stream) {
        if (vEl.srcObject !== stream) {
          vEl.srcObject = stream;
        }
        vEl.play().catch(() => {});
      }
      const aEl = remoteAudioRefs.current.get(peerId);
      if (aEl && stream) {
        if (aEl.srcObject !== stream) {
          aEl.srcObject = stream;
        }
        aEl.play().catch((err) => {
          console.warn('Audio play prevented:', err);
          setAudioBlocked(true);
        });
      }
    });
  }, [remoteStreams, streamVersion, peerMediaState]);

  // ---- Attach Analyser for Remote Stream ----

  const attachRemoteAnalyser = useCallback((peerId: string, stream: MediaStream) => {
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;

      if (remoteAnalysersRef.current.has(peerId)) {
        try {
          remoteAnalysersRef.current.get(peerId)?.source.disconnect();
        } catch {
          // ignore
        }
        remoteAnalysersRef.current.delete(peerId);
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      remoteAnalysersRef.current.set(peerId, { analyser, source });
    } catch (err) {
      console.warn('Could not attach remote audio analyser:', err);
    }
  }, [getOrCreateAudioContext]);

  // ---- Load meeting details ----

  const loadMeeting = useCallback(async () => {
    try {
      const m = await api.details(meetingId);
      setMeeting(m);
      if (m.status === 'ended') {
        setError('This meeting has ended.');
      }
    } catch {
      // Resilient fallback meeting if not registered yet
      const fallbackMeeting: Meeting = {
        meeting_id: meetingId,
        invite_token: 'zoom_' + meetingId.slice(0, 6),
        title: `${displayName || 'Sahil Dargar'}'s Zoom Meeting`,
        host_name: 'Sahil Dargar',
        scheduled_time: new Date().toISOString(),
        duration_minutes: 60,
        status: 'active',
        created_at: new Date().toISOString(),
        invite_url: typeof window !== 'undefined' ? `${window.location.origin}/join?meeting=${meetingId}` : '',
        participant_count: 1,
      };
      setMeeting(fallbackMeeting);
    }
  }, [meetingId, displayName]);

  // ---- Load participants & detect kicked ----

  const loadParticipants = useCallback(async () => {
    try {
      const parts = await api.participants(meetingId);
      setPeople(parts);
      const wasLoaded = hasLoadedInitialParticipantsRef.current;
      hasLoadedInitialParticipantsRef.current = true;
      setHasLoadedInitialParticipants(true);

      if (sessionIdRef.current && wasLoaded) {
        const stillInRoom = parts.some(
          (p) => p.session_id === sessionIdRef.current && p.left_at === null
        );
        if (!stillInRoom) {
          setKicked(true);
        }
      }
    } catch {
      // Silent fail for polling
    }
  }, [meetingId]);

  loadParticipantsRef.current = loadParticipants;

  useEffect(() => {
    loadMeeting();
  }, [loadMeeting]);

  useEffect(() => {
    if (!sessionId) return;
    loadParticipants();

    pollRef.current = setInterval(loadParticipants, 4000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId, loadParticipants]);

  // Ensure local video element updates whenever cameraOn or stream changes
  useEffect(() => {
    if (videoRef.current) {
      if (cameraOn && videoStreamRef.current) {
        videoRef.current.srcObject = videoStreamRef.current;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [cameraOn]);

  // ---- Voice Activity Detection (VAD) Loop ----

  useEffect(() => {
    if (!sessionId) return;

    vadIntervalRef.current = setInterval(() => {
      // 1. Check local audio
      if (localAnalyserRef.current && !mutedRef.current && audioStreamRef.current?.getAudioTracks().some((t) => t.enabled)) {
        const data = new Uint8Array(localAnalyserRef.current.frequencyBinCount);
        localAnalyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        const vol = Math.min(100, Math.round((avg / 128) * 100));
        setLocalVolume(vol);

        const isSpk = vol > 7;
        setLocalSpeaking((prev) => {
          if (prev !== isSpk) {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: 'speaking',
                  peerId: sessionIdRef.current,
                  speaking: isSpk,
                })
              );
            }
          }
          return isSpk;
        });
      } else {
        setLocalVolume(0);
        setLocalSpeaking(false);
      }

      // 2. Check remote peers audio energy
      remoteAnalysersRef.current.forEach(({ analyser }, pid) => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        const vol = Math.min(100, Math.round((avg / 128) * 100));
        const isSpk = vol > 7;

        setPeerSpeaking((prev) => {
          if (prev[pid] !== isSpk) {
            return { ...prev, [pid]: isSpk };
          }
          return prev;
        });
      });
    }, 70);

    return () => {
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
    };
  }, [sessionId]);

  // ---- WebRTC Peer Connection Helper (Transceiver Pattern) ----

  const createPeerConnection = useCallback((targetPeerId: string, isInitiator: boolean) => {
    let pc = peerConnectionsRef.current.get(targetPeerId);
    if (pc && pc.signalingState !== 'closed') {
      return pc;
    }

    console.log(`[Zooom WebRTC] Creating peer connection for ${targetPeerId} (initiator: ${isInitiator})`);
    pc = new RTCPeerConnection(rtcConfigRef.current || DEFAULT_RTC_CONFIG);
    peerConnectionsRef.current.set(targetPeerId, pc);

    // Audio: attach active track or create sendrecv transceiver
    if (audioStreamRef.current && audioStreamRef.current.getAudioTracks().length > 0) {
      const aTrack = audioStreamRef.current.getAudioTracks()[0];
      if (aTrack && aTrack.readyState === 'live') {
        pc.addTrack(aTrack, audioStreamRef.current);
      } else {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }
    } else {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }

    // Video: attach active track or create sendrecv transceiver
    if (videoStreamRef.current && videoStreamRef.current.getVideoTracks().length > 0) {
      const vTrack = videoStreamRef.current.getVideoTracks()[0];
      if (vTrack && vTrack.readyState === 'live') {
        pc.addTrack(vTrack, videoStreamRef.current);
      } else {
        pc.addTransceiver('video', { direction: 'sendrecv' });
      }
    } else {
      pc.addTransceiver('video', { direction: 'sendrecv' });
    }

    // ICE Candidate exchange
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        console.log(`[Zooom WebRTC] Local ICE candidate generated for ${targetPeerId}`);
        wsRef.current.send(
          JSON.stringify({
            type: 'candidate',
            peerId: sessionIdRef.current,
            targetPeerId: targetPeerId,
            candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
          })
        );
      }
    };

    // Receive remote media tracks
    pc.ontrack = (event) => {
      const track = event.track;
      console.log(`[Zooom WebRTC] ontrack received: kind=${track.kind}, id=${track.id} from ${targetPeerId}`);

      if (!remoteMediaStreamsRef.current[targetPeerId]) {
        remoteMediaStreamsRef.current[targetPeerId] = new MediaStream();
      }
      const stream = remoteMediaStreamsRef.current[targetPeerId];

      // Remove any existing dead tracks of the same kind
      stream.getTracks().filter((t) => t.kind === track.kind && t.id !== track.id).forEach((t) => stream.removeTrack(t));

      if (!stream.getTracks().some((t) => t.id === track.id)) {
        stream.addTrack(track);
      }

      setRemoteStreams({ ...remoteMediaStreamsRef.current });
      setStreamVersion((v) => v + 1);

      // Immediately bind to any existing mounted video and audio elements
      const vEl = remoteVideoRefs.current.get(targetPeerId);
      if (vEl && vEl.srcObject !== stream) {
        vEl.srcObject = stream;
        vEl.play().catch(() => {});
      }
      const aEl = remoteAudioRefs.current.get(targetPeerId);
      if (aEl && aEl.srcObject !== stream) {
        aEl.srcObject = stream;
        aEl.play().catch((err) => {
          console.warn('[Zooom WebRTC] Remote audio autoplay blocked:', err);
          setAudioBlocked(true);
        });
      }

      const onTrackChange = () => {
        console.log(`[Zooom WebRTC] Remote track changed (${track.kind}) for ${targetPeerId}: readyState=${track.readyState}, enabled=${track.enabled}`);
        setStreamVersion((v) => v + 1);
      };
      track.addEventListener('mute', onTrackChange);
      track.addEventListener('unmute', onTrackChange);
      track.addEventListener('ended', onTrackChange);

      if (track.kind === 'audio') {
        setTimeout(() => {
          attachRemoteAnalyser(targetPeerId, stream);
        }, 150);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[Zooom WebRTC] ICE connection state for ${targetPeerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[Zooom WebRTC] ICE connection failed for ${targetPeerId}, restarting ICE...`);
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Zooom WebRTC] Connection state for ${targetPeerId}: ${pc.connectionState}`);
    };

    // If initiator, create and send initial offer
    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN && pc.localDescription) {
            console.log(`[Zooom WebRTC] Sending initial offer to ${targetPeerId}`);
            wsRef.current.send(
              JSON.stringify({
                type: 'offer',
                peerId: sessionIdRef.current,
                targetPeerId: targetPeerId,
                sdp: pc.localDescription,
              })
            );
          }
        })
        .catch((err) => console.warn(`[Zooom WebRTC] Offer error for ${targetPeerId}:`, err));
    }

    return pc;
  }, [attachRemoteAnalyser]);

  // Keep a ref to createPeerConnection so useEffect doesn't tear down on changes
  const createPeerConnectionRef = useRef(createPeerConnection);
  createPeerConnectionRef.current = createPeerConnection;

  // Renegotiate peer helper
  const renegotiatePeer = useCallback(async (targetPeerId: string, pc: RTCPeerConnection) => {
    if (pc.signalingState !== 'stable') return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (wsRef.current?.readyState === WebSocket.OPEN && pc.localDescription) {
        console.log(`[Zooom WebRTC] Sending renegotiation offer to ${targetPeerId}`);
        wsRef.current.send(
          JSON.stringify({
            type: 'offer',
            peerId: sessionIdRef.current,
            targetPeerId: targetPeerId,
            sdp: pc.localDescription,
          })
        );
      }
    } catch (err) {
      console.warn(`[Zooom WebRTC] Renegotiation offer error for ${targetPeerId}:`, err);
    }
  }, []);

  const renegotiatePeerRef = useRef(renegotiatePeer);
  renegotiatePeerRef.current = renegotiatePeer;

  // ---- WebSocket Signaling (Runs ONLY for session lifecycle) ----

  useEffect(() => {
    if (!sessionId || !meetingId) return;

    const wsUrl = getWsBaseUrl(meetingId);
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('[Zooom WebRTC] WebSocket connected to signaling:', wsUrl);
        socket.send(
          JSON.stringify({
            type: 'join',
            peerId: sessionId,
            displayName: displayNameRef.current || 'Sahil Dargar',
          })
        );
      };

      socket.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log(`[Zooom WebRTC] Message received: type=${msg.type}, from=${msg.peerId || 'server'}`);

          if (msg.type === 'peers') {
            if (Array.isArray(msg.peerIds)) {
              msg.peerIds.forEach((pid: string) => {
                if (pid && pid !== sessionId) {
                  createPeerConnectionRef.current(pid, true);
                }
              });
            }
            loadParticipantsRef.current();

            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  type: 'media-state',
                  peerId: sessionId,
                  video: cameraOnRef.current,
                  audio: !mutedRef.current,
                })
              );
            }
          } else if (msg.type === 'peer-joined') {
            if (msg.peerId && msg.displayName) {
              peerNamesRef.current[msg.peerId] = msg.displayName;
            }
            loadParticipantsRef.current();
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  type: 'media-state',
                  peerId: sessionId,
                  targetPeerId: msg.peerId,
                  video: cameraOnRef.current,
                  audio: !mutedRef.current,
                })
              );
            }
          } else if (msg.type === 'offer') {
            let pc = peerConnectionsRef.current.get(msg.peerId);
            if (!pc || pc.signalingState === 'closed') {
              pc = createPeerConnectionRef.current(msg.peerId, false);
            }
            console.log(`[Zooom WebRTC] Setting remote description (offer) from ${msg.peerId}`);
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

            // Attach active local tracks to matched transceivers/senders
            const vSender = getMediaSender(pc, 'video');
            if (vSender && videoStreamRef.current?.getVideoTracks()[0]) {
              await vSender.replaceTrack(videoStreamRef.current.getVideoTracks()[0]).catch(console.warn);
            }
            const aSender = getMediaSender(pc, 'audio');
            if (aSender && audioStreamRef.current?.getAudioTracks()[0]) {
              await aSender.replaceTrack(audioStreamRef.current.getAudioTracks()[0]).catch(console.warn);
            }

            // Flush pending ICE candidates
            const queued = pendingCandidatesRef.current[msg.peerId] || [];
            console.log(`[Zooom WebRTC] Flushing ${queued.length} queued ICE candidates for ${msg.peerId}`);
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch((err) => {
                console.warn('[Zooom WebRTC] Failed to add buffered ICE candidate:', err);
              });
            }
            pendingCandidatesRef.current[msg.peerId] = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (wsRef.current?.readyState === WebSocket.OPEN && pc.localDescription) {
              console.log(`[Zooom WebRTC] Sending answer to ${msg.peerId}`);
              wsRef.current.send(
                JSON.stringify({
                  type: 'answer',
                  peerId: sessionId,
                  targetPeerId: msg.peerId,
                  sdp: pc.localDescription,
                })
              );
            }
          } else if (msg.type === 'answer') {
            const pc = peerConnectionsRef.current.get(msg.peerId);
            if (pc && pc.signalingState === 'have-local-offer') {
              console.log(`[Zooom WebRTC] Setting remote description (answer) from ${msg.peerId}`);
              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              const queued = pendingCandidatesRef.current[msg.peerId] || [];
              console.log(`[Zooom WebRTC] Flushing ${queued.length} queued ICE candidates for ${msg.peerId}`);
              for (const cand of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch((err) => {
                  console.warn('[Zooom WebRTC] Failed to add buffered ICE candidate:', err);
                });
              }
              pendingCandidatesRef.current[msg.peerId] = [];
            }
          } else if (msg.type === 'candidate') {
            const pc = peerConnectionsRef.current.get(msg.peerId);
            if (msg.candidate) {
              if (pc && pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch((err) => {
                  console.warn('[Zooom WebRTC] Failed to add incoming ICE candidate:', err);
                });
              } else {
                console.log(`[Zooom WebRTC] Buffering early ICE candidate from ${msg.peerId}`);
                if (!pendingCandidatesRef.current[msg.peerId]) {
                  pendingCandidatesRef.current[msg.peerId] = [];
                }
                pendingCandidatesRef.current[msg.peerId].push(msg.candidate);
              }
            }
          } else if (msg.type === 'media-state') {
            setPeerMediaState((prev) => ({
              ...prev,
              [msg.peerId]: { video: !!msg.video, audio: !!msg.audio },
            }));
            setStreamVersion((v) => v + 1);
          } else if (msg.type === 'mute-peer') {
            if ((!msg.targetPeerId || msg.targetPeerId === sessionIdRef.current) && !isHostRef.current) {
              if (audioStreamRef.current) {
                audioStreamRef.current.getAudioTracks().forEach((t) => {
                  t.enabled = false;
                });
              }
              setMuted(true);
              setLocalSpeaking(false);
              setLocalVolume(0);
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(
                  JSON.stringify({
                    type: 'media-state',
                    peerId: sessionIdRef.current,
                    video: cameraOnRef.current,
                    audio: false,
                  })
                );
              }
              setMuteNotice('The host muted your microphone');
              setTimeout(() => setMuteNotice(''), 4500);
            }
          } else if (msg.type === 'mute-all') {
            if (!isHostRef.current) {
              if (audioStreamRef.current) {
                audioStreamRef.current.getAudioTracks().forEach((t) => {
                  t.enabled = false;
                });
              }
              setMuted(true);
              setLocalSpeaking(false);
              setLocalVolume(0);
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(
                  JSON.stringify({
                    type: 'media-state',
                    peerId: sessionIdRef.current,
                    video: cameraOnRef.current,
                    audio: false,
                  })
                );
              }
              setMuteNotice('The host muted all participants');
              setTimeout(() => setMuteNotice(''), 4500);
            }
          } else if (msg.type === 'speaking') {
            setPeerSpeaking((prev) => ({
              ...prev,
              [msg.peerId]: !!msg.speaking,
            }));
          } else if (msg.type === 'reaction') {
            const newReaction = {
              id: `${Date.now()}_${Math.random()}`,
              emoji: msg.emoji || '👍',
              left: 20 + Math.random() * 60,
            };
            setFloatingReactions((prev) => [...prev, newReaction]);
            setTimeout(() => {
              setFloatingReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
            }, 2400);
          } else if (msg.type === 'peer-left') {
            console.log(`[Zooom WebRTC] Peer left: ${msg.peerId}`);
            const pc = peerConnectionsRef.current.get(msg.peerId);
            if (pc) {
              pc.close();
              peerConnectionsRef.current.delete(msg.peerId);
            }
            if (remoteAnalysersRef.current.has(msg.peerId)) {
              try {
                remoteAnalysersRef.current.get(msg.peerId)?.source.disconnect();
              } catch {
                // ignore
              }
              remoteAnalysersRef.current.delete(msg.peerId);
            }
            remoteVideoRefs.current.delete(msg.peerId);
            remoteAudioRefs.current.delete(msg.peerId);
            delete remoteMediaStreamsRef.current[msg.peerId];
            delete peerNamesRef.current[msg.peerId];
            setRemoteStreams({ ...remoteMediaStreamsRef.current });
            setPeerSpeaking((prev) => {
              const copy = { ...prev };
              delete copy[msg.peerId];
              return copy;
            });
            setPeerMediaState((prev) => {
              const copy = { ...prev };
              delete copy[msg.peerId];
              return copy;
            });
            // Immediately drop from participants list so stage and drawer update with zero delay
            setPeople((prev) => prev.filter((p) => p.session_id !== msg.peerId));
            loadParticipantsRef.current();
          } else if (msg.type === 'meeting-ended') {
            alert('The host has ended this meeting for all participants.');
            cleanup();
            window.location.href = '/';
            return;
          }
        } catch (err) {
          console.warn('[Zooom WebRTC] Signaling message handling error:', err);
        }
      };

      socket.onerror = (err) => {
        console.warn('[Zooom WebRTC] WebSocket error:', err);
      };

      socket.onclose = (event) => {
        console.log(`[Zooom WebRTC] WebSocket closed: code=${event.code}, reason=${event.reason}`);
      };
    } catch (err) {
      console.warn('[Zooom WebRTC] Failed to initialize WebSocket:', err);
    }

    return () => {
      console.log('[Zooom WebRTC] Cleaning up WebSocket and PeerConnections for session:', sessionId);
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      pendingCandidatesRef.current = {};

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({
              type: 'leave',
              peerId: sessionId,
            })
          );
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [sessionId, meetingId]);

  // ---- Handle Lobby Direct Join ----

  const handleLobbyJoin = useCallback(async (customName?: string) => {
    const activeStored = getStoredUser();
    const nameToUse = (customName || (activeStored ? activeStored.display_name : joinPromptName) || displayName).trim();
    if (!nameToUse || nameToUse.length < 2) {
      setJoinError('Please enter your display name (at least 2 characters).');
      return;
    }

    setJoining(true);
    setJoinError('');

    try {
      const res = await api.join({
        meeting_id: meetingId,
        display_name: nameToUse,
        is_host: initialHost,
      });
      setSessionId(res.session_id);
      setDisplayName(nameToUse);
      setIsHost(res.is_host);
      setMeeting(res.meeting);
      const newUrl = `/meeting/${meetingId}?session=${res.session_id}&name=${encodeURIComponent(nameToUse)}${res.is_host ? '&host=true' : ''}`;
      window.history.replaceState(null, '', newUrl);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '';
      if (errMsg.toLowerCase().includes('ended')) {
        setError('This meeting has ended and is no longer available.');
        return;
      }
      // Fallback local session if backend offline or meeting was client-created
      const mockSession = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      setSessionId(mockSession);
      setDisplayName(nameToUse);
      const isHostFallback = initialHost;
      setIsHost(isHostFallback);
      const newUrl = `/meeting/${meetingId}?session=${mockSession}&name=${encodeURIComponent(nameToUse)}${isHostFallback ? '&host=true' : ''}`;
      window.history.replaceState(null, '', newUrl);
    } finally {
      setJoining(false);
    }
  }, [joinPromptName, displayName, meetingId, initialHost]);

  // Auto-join meeting:
  // - If queryName is provided -> auto-join
  // - If user is logged into this browser (getStoredUser()) -> auto-join directly as logged-in user
  // - Otherwise (guest), do NOT auto-join -> user sees the lobby prompt for their display name
  useEffect(() => {
    if (!sessionId && meeting && !joining && !joinError) {
      if (queryName) {
        handleLobbyJoin(queryName);
      } else {
        const stored = getStoredUser();
        if (stored && stored.display_name) {
          handleLobbyJoin(stored.display_name);
        }
      }
    }
  }, [meeting, sessionId, queryName, handleLobbyJoin, joining, joinError]);

  // ---- In-Meeting Reactions & Chat ----

  const sendReaction = (emoji: string) => {
    const newReaction = {
      id: `${Date.now()}_${Math.random()}`,
      emoji,
      left: 20 + Math.random() * 60,
    };
    setFloatingReactions((prev) => [...prev, newReaction]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
    }, 2400);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'reaction',
          peerId: sessionId,
          sender: displayName,
          emoji,
        })
      );
    }
    setReactMenuOpen(false);
  };

  // ---- Auto-initialize camera & mic upon entering meeting room ----

  useEffect(() => {
    if (!sessionId) return;
    let isMounted = true;

    async function initMedia() {
      try {
        console.log('[Zooom WebRTC] Requesting local camera & microphone permissions...');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        console.log('[Zooom WebRTC] Local camera and microphone acquired successfully');
        videoStreamRef.current = new MediaStream(stream.getVideoTracks());
        audioStreamRef.current = new MediaStream(stream.getAudioTracks());
        stream.getVideoTracks().forEach((t) => (t.enabled = false));
        stream.getAudioTracks().forEach((t) => (t.enabled = false));
        setCameraOn(false);
        setMuted(true);

        if (videoRef.current) {
          videoRef.current.srcObject = videoStreamRef.current;
          videoRef.current.play().catch(() => {});
        }

        // Setup local audio analyser for speaking wave
        const ctx = getOrCreateAudioContext();
        if (ctx) {
          try {
            const source = ctx.createMediaStreamSource(audioStreamRef.current);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.4;
            source.connect(analyser);
            localAnalyserRef.current = analyser;
          } catch (e) {
            console.warn('[Zooom WebRTC] Local audio analyser setup error:', e);
          }
        }

        // Update senders on any already established peer connections
        peerConnectionsRef.current.forEach(async (pc, peerId) => {
          const vSender = getMediaSender(pc, 'video');
          const vTrack = stream.getVideoTracks()[0];
          if (vSender && vTrack) {
            await vSender.replaceTrack(vTrack).catch(console.warn);
          }
          const aSender = getMediaSender(pc, 'audio');
          const aTrack = stream.getAudioTracks()[0];
          if (aSender && aTrack) {
            await aSender.replaceTrack(aTrack).catch(console.warn);
          }
        });

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'media-state',
              peerId: sessionId,
              video: true,
              audio: true,
            })
          );
        }
      } catch (err) {
        console.log('[Zooom WebRTC] Initial media acquisition skipped (permission or hardware):', err);
      }
    }

    initMedia();

    return () => {
      isMounted = false;
    };
  }, [sessionId, getOrCreateAudioContext]);

  // ---- Media controls (Camera & Mic with replaceTrack & renegotiation) ----

  const toggleCamera = async () => {
    if (cameraOn) {
      videoStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);

      // Seamlessly replace video track with null on all peer connections
      peerConnectionsRef.current.forEach((pc) => {
        const vSender = getMediaSender(pc, 'video');
        if (vSender) {
          vSender.replaceTrack(null).catch(console.warn);
        }
      });

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'media-state',
            peerId: sessionId,
            video: false,
            audio: !muted,
          })
        );
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
      setMediaError('');

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        peerConnectionsRef.current.forEach(async (pc, peerId) => {
          const vSender = getMediaSender(pc, 'video');
          if (vSender) {
            await vSender.replaceTrack(videoTrack).catch(console.warn);
          } else {
            pc.addTrack(videoTrack, stream);
            await renegotiatePeerRef.current(peerId, pc);
          }
        });

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'media-state',
              peerId: sessionId,
              video: true,
              audio: !muted,
            })
          );
        }
      }
    } catch {
      setMediaError(
        'Camera permission was denied or device is unavailable. You can still participate with audio.'
      );
    }
  };

  const toggleMic = async () => {
    if (!muted) {
      // Mute microphone
      if (audioStreamRef.current) {
        audioStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
      }
      setMuted(true);
      setLocalSpeaking(false);
      setLocalVolume(0);

      peerConnectionsRef.current.forEach((pc) => {
        const aSender = getMediaSender(pc, 'audio');
        if (aSender) {
          aSender.replaceTrack(null).catch(console.warn);
        }
      });

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'media-state',
            peerId: sessionId,
            video: cameraOn,
            audio: false,
          })
        );
        wsRef.current.send(
          JSON.stringify({
            type: 'speaking',
            peerId: sessionId,
            speaking: false,
          })
        );
      }
      return;
    }

    // Unmute microphone
    try {
      let stream = audioStreamRef.current;
      if (
        !stream ||
        stream.getAudioTracks().length === 0 ||
        stream.getAudioTracks()[0].readyState === 'ended'
      ) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        audioStreamRef.current = stream;
      } else {
        stream.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });
      }

      setMuted(false);
      setMediaError('');

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;

        peerConnectionsRef.current.forEach(async (pc, peerId) => {
          const aSender = getMediaSender(pc, 'audio');
          if (aSender) {
            await aSender.replaceTrack(audioTrack).catch(console.warn);
          } else {
            pc.addTrack(audioTrack, stream!);
            await renegotiatePeerRef.current(peerId, pc);
          }
        });

        // Attach local Audio Analyser for speaking visualizer
        const ctx = getOrCreateAudioContext();
        if (ctx) {
          try {
            if (!localAnalyserRef.current) {
              const source = ctx.createMediaStreamSource(stream);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 256;
              analyser.smoothingTimeConstant = 0.4;
              source.connect(analyser);
              localAnalyserRef.current = analyser;
            }
          } catch (e) {
            console.warn('[Zooom WebRTC] Local audio analyser setup error:', e);
          }
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'media-state',
              peerId: sessionId,
              video: cameraOn,
              audio: true,
            })
          );
        }
      }
    } catch {
      setMediaError(
        'Microphone permission was denied or device is unavailable. You can still participate with video.'
      );
    }
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
      setScreenSharing(false);

      const camTrack = videoStreamRef.current?.getVideoTracks()[0] || null;
      peerConnectionsRef.current.forEach((pc) => {
        const vSender = getMediaSender(pc, 'video');
        if (vSender) {
          vSender.replaceTrack(camTrack).catch(console.warn);
        }
      });
      return;
    }

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setMediaError('Screen sharing is not supported by your current browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        screenVideoRef.current.play().catch(() => {});
      }
      setScreenSharing(true);
      setMediaError('');

      const screenTrack = stream.getVideoTracks()[0];
      if (screenTrack) {
        peerConnectionsRef.current.forEach((pc) => {
          const vSender = getMediaSender(pc, 'video');
          if (vSender) {
            vSender.replaceTrack(screenTrack).catch(console.warn);
          }
        });

        screenTrack.onended = () => {
          setScreenSharing(false);
          screenStreamRef.current = null;
          const camTrack = videoStreamRef.current?.getVideoTracks()[0] || null;
          peerConnectionsRef.current.forEach((pc) => {
            const vSender = getMediaSender(pc, 'video');
            if (vSender) {
              vSender.replaceTrack(camTrack).catch(console.warn);
            }
          });
        };
      }
    } catch {
      // User cancelled screen picker
    }
  };

  // ---- Leave / End ----

  const cleanup = useCallback(() => {
    if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
    videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (pollRef.current) clearInterval(pollRef.current);
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current = {};
    remoteMediaStreamsRef.current = {};
    remoteAnalysersRef.current.forEach(({ source }) => {
      try {
        source.disconnect();
      } catch {
        // ignore
      }
    });
    remoteAnalysersRef.current.clear();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
    }
  }, []);

  const handleLeave = async () => {
    setLeaving(true);
    try {
      if (sessionId) {
        await api.leave(meetingId, sessionId);
      }
    } catch {
      // best effort
    }
    cleanup();
    window.location.href = '/';
  };

  const handleEnd = async () => {
    setLeaving(true);
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'meeting-ended',
          })
        );
      }
      await api.end(meetingId);
    } catch {
      // best effort
    }
    cleanup();
    window.location.href = '/';
  };

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Automatically leave meeting if browser window/tab is closed
  useEffect(() => {
    const handleWindowExit = () => {
      const curSession = sessionIdRef.current;
      if (!curSession) return;

      // 1. Send WebSocket 'leave' message immediately if open
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'leave', peerId: curSession }));
          wsRef.current.close();
        } catch {
          // ignore
        }
      }

      // 2. Fire keepalive beacon to mark participant as left in database
      try {
        const base = getApiBaseUrl();
        const leaveUrl = `${base}/api/meetings/${meetingId}/leave`;
        const payload = JSON.stringify({ session_id: curSession });
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(leaveUrl, blob);
        } else {
          fetch(leaveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('beforeunload', handleWindowExit);
    window.addEventListener('pagehide', handleWindowExit);

    return () => {
      window.removeEventListener('beforeunload', handleWindowExit);
      window.removeEventListener('pagehide', handleWindowExit);
    };
  }, [meetingId]);

  // ---- Copy invitation ----

  const copyInvite = async () => {
    if (!meeting) return;
    try {
      const url = formatInviteUrl(
        meeting.invite_url,
        meeting.meeting_id,
        meeting.invite_token
      );
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // ---- Host: kick participant ----

  const handleKick = async (participantId: number) => {
    if (!sessionId || !isHost) return;
    try {
      await api.kick(meetingId, {
        host_session_id: sessionId,
        participant_id: participantId,
      });
      loadParticipants();
    } catch {
      // silent
    }
  };

  // ---- Host: mute individual participant ----
  const handleMutePeer = useCallback((targetPeerId: string, targetName?: string) => {
    if (!isHost) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'mute-peer',
          peerId: sessionIdRef.current,
          targetPeerId: targetPeerId,
        })
      );
    }
    // Optimistically update target peer audio to false in local UI
    setPeerMediaState((prev) => ({
      ...prev,
      [targetPeerId]: {
        video: prev[targetPeerId]?.video ?? false,
        audio: false,
      },
    }));
  }, [isHost]);

  // ---- Host: mute all participants ----
  const handleMuteAll = useCallback(() => {
    if (!isHost) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'mute-all',
          peerId: sessionIdRef.current,
        })
      );
    }
    // Optimistically mute all remote peers in host UI
    setPeerMediaState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((pid) => {
        next[pid] = { ...next[pid], audio: false };
      });
      return next;
    });
  }, [isHost]);

  // ---- Render: Kicked state ----

  if (kicked) {
    return (
      <main
        className="meeting-room"
        style={{ display: 'grid', placeItems: 'center' }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <UserX
            size={52}
            style={{ color: '#ef4444', margin: '0 auto 16px' }}
          />
          <h2 style={{ fontSize: 24, marginBottom: 8, color: '#f87171' }}>
            Removed from meeting
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
            The meeting host has removed you from this Zooom room.
          </p>
          <a className="btn btn-primary" href="/">
            Return home
          </a>
        </div>
      </main>
    );
  }

  // ---- Render: Error state ----

  if (error && !meeting) {
    return (
      <main
        className="meeting-room"
        style={{ display: 'grid', placeItems: 'center' }}
      >
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
          <AlertTriangle
            size={48}
            style={{ color: '#f59e0b', margin: '0 auto 16px' }}
          />
          <h2 style={{ fontSize: 24, marginBottom: 8 }}>
            Room unavailable
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: 14 }}>
            {error}
          </p>
          <a className="btn btn-primary" href="/">
            Return home
          </a>
        </div>
      </main>
    );
  }

  // ---- Render: Loading state ----

  if (!meeting) {
    return (
      <main
        className="meeting-room"
        style={{ display: 'grid', placeItems: 'center' }}
      >
        <div
          style={{
            textAlign: 'center',
            color: '#94a3b8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <LoaderCircle size={32} className="spin" />
          <span>Connecting to Zooom...</span>
        </div>
      </main>
    );
  }

  // ---- Render: Direct Join Lobby (if no session established) ----

  if (!sessionId) {
    if (isMounted && clientUser && !joinError) {
      return (
        <main className="page-center">
          <div className="modal" style={{ width: 'min(440px, 100%)', textAlign: 'center', padding: '36px 24px' }}>
            <LoaderCircle size={36} className="spin" style={{ color: '#0B5CFF', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
              Connecting to Meeting...
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: 0 }}>
              Entering room <strong>{meeting.meeting_id}</strong> as <strong>{clientUser.display_name}</strong>
            </p>
          </div>
        </main>
      );
    }

    return (
      <main className="page-center">
        <div className="modal" style={{ width: 'min(480px, 100%)' }}>
          <div className="modal-head">
            <div>
              <div className="eyebrow">Ready to join?</div>
              <h2>{meeting.title}</h2>
            </div>
            <span className="meeting-id-badge">Room {meeting.meeting_id}</span>
          </div>

          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
            {meeting.description || 'You are about to join this Zooom meeting.'}
          </p>

          <div className="field">
            <label htmlFor="lobby-name">Your display name</label>
            <input
              id="lobby-name"
              value={joinPromptName}
              onChange={(e) => setJoinPromptName(e.target.value)}
              placeholder="e.g. Sahil Dargar or your name"
              onKeyDown={(e) => e.key === 'Enter' && handleLobbyJoin()}
              autoFocus
            />
          </div>

          {joinError && <p className="form-error" role="alert">{joinError}</p>}

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => handleLobbyJoin()}
            disabled={joining}
          >
            {joining ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <LogIn size={15} />
            )}
            {joining ? 'Entering room...' : 'Join Meeting'}
          </button>
        </div>
      </main>
    );
  }

  // ---- Grid layout calculation (All participants in mesh) ----

  // Merge database participants with active WebRTC peers
  const activePeerIds = new Set<string>();
  Object.keys(remoteStreams).forEach((id) => activePeerIds.add(id));
  peerConnectionsRef.current.forEach((_, id) => activePeerIds.add(id));
  Object.keys(peerMediaState).forEach((id) => activePeerIds.add(id));

  const participantMap = new Map<string, Participant>();
  people.forEach((p) => {
    if (p.session_id !== sessionId) {
      participantMap.set(p.session_id, p);
    }
  });

  activePeerIds.forEach((pid) => {
    if (pid !== sessionId && !participantMap.has(pid)) {
      participantMap.set(pid, {
        id: Math.abs(pid.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)),
        display_name: peerNamesRef.current[pid] || 'Participant',
        is_host: false,
        session_id: pid,
        joined_at: new Date().toISOString(),
        left_at: null,
      });
    }
  });

  const otherPeople = Array.from(participantMap.values());
  const totalTiles = 1 + otherPeople.length + (screenSharing ? 1 : 0);
  const gridClass =
    totalTiles <= 1
      ? 'video-grid solo'
      : totalTiles <= 2
        ? 'video-grid'
        : totalTiles <= 4
          ? 'video-grid four'
          : 'video-grid';

  // ---- Render: Active Zoom Meeting Room matching Reference Interface ----

  return (
    <div className="zoom-workplace-app zoom-meeting-page-root">
      {/* Zoom Workplace Topbar */}
      <ZoomHeader
        onNavigateTab={(tab) => {
          if (confirm(`Leave meeting to return to ${tab}?`)) {
            handleLeave();
          }
        }}
      />

      {/* Main Container: Left NavRail + In-Meeting Canvas */}
      <div className="zoom-meeting-app-body" style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Left Navigation Rail */}
        <ZoomNavRail
          activeTab="meetings"
          onSelectTab={(tab) => {
            if (confirm(`Leave meeting to view ${tab}?`)) {
              handleLeave();
            }
          }}
        />

        {/* In-Meeting Room Frame */}
        <main
          className="zoom-inmeeting-app-shell"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#000000',
            overflow: 'hidden',
            height: '100%',
            minWidth: 0,
            position: 'relative',
          }}
        >
          {/* 1. In-Meeting Top Bar */}
          <div className="zoom-inmeeting-topbar">
            {/* Left: Info button with green shield badge + Meeting Title */}
            <div className="zoom-inmeeting-left">
              <button
                className="zoom-info-badge-btn"
                title="Meeting Information"
                onClick={() => setInfoPopupOpen(!infoPopupOpen)}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'rgba(34, 197, 94, 0.2)',
                    border: '1.5px solid #22c55e',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#22c55e',
                    fontSize: 11,
                    fontWeight: 800,
                    fontFamily: 'serif',
                    lineHeight: 1,
                  }}
                >
                  i
                </div>
              </button>
              <span className="zoom-inmeeting-title">
                {displayName}&apos;s Zoom Meeting
              </span>
            </div>

            {/* Right: Security Check, AI Sparkle, View Layout, User Avatar */}
            <div className="zoom-inmeeting-right">
              <button
                className="zoom-inmeeting-icon-btn"
                title="Verified End-to-End Encryption"
                style={{ color: '#22c55e' }}
              >
                <ShieldCheck size={18} />
              </button>

              <button
                className="zoom-inmeeting-icon-btn"
                title="Zoom AI Companion is active"
                style={{ color: '#38bdf8' }}
                onClick={() => alert('Zoom AI Companion is active and ready.')}
              >
                <Sparkles size={18} />
              </button>

              <button
                className="zoom-inmeeting-icon-btn"
                title="View Layout"
                onClick={() => setViewMode(viewMode === 'speaker' ? 'gallery' : 'speaker')}
              >
                <LayoutGrid size={18} />
              </button>

              <div className="zoom-inmeeting-avatar" title={displayName || 'Sahil Dargar'}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{getInitial(displayName || 'SD')}</span>
              </div>
            </div>
          </div>

          {/* Meeting Info Popup (when green info shield is clicked) */}
          {infoPopupOpen && (
            <div className="zoom-info-card-popup">
              <h4>Meeting Information</h4>
              <div className="zoom-info-row">
                <label>Meeting Topic</label>
                <span>{displayName}&apos;s Zoom Meeting</span>
              </div>
              <div className="zoom-info-row">
                <label>Meeting ID</label>
                <span>{meeting.meeting_id}</span>
              </div>
              <div className="zoom-info-row">
                <label>Host</label>
                <span>{displayName}</span>
              </div>
              <div className="zoom-info-row">
                <label>Passcode</label>
                <span>{meeting.passcode || 'Protected'}</span>
              </div>
              <div className="zoom-info-row">
                <label>Invite Link</label>
                <button className="zoom-copy-link-btn" onClick={copyInvite}>
                  {copied ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
                  {copied ? 'Link Copied!' : 'Copy Link'}
                </button>
              </div>
              <div className="zoom-encryption-badge">
                <ShieldCheck size={14} />
                <span>Verified End-to-End Encryption</span>
              </div>
            </div>
          )}

          {/* Media Error Notification Banner */}
          {mediaError && (
            <div
              style={{
                background: 'rgba(234, 88, 12, 0.15)',
                borderBottom: '1px solid rgba(234, 88, 12, 0.3)',
                padding: '8px 20px',
                fontSize: 12,
                color: '#fb923c',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                zIndex: 30,
              }}
            >
              <AlertTriangle size={14} />
              {mediaError}
              <button
                style={{
                  marginLeft: 'auto',
                  color: '#fb923c',
                  fontSize: 11,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={() => setMediaError('')}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* 2. Main In-Meeting Stage Area */}
          <div className="zoom-inmeeting-stage">
            {/* Host Mute Notice Toast */}
            {muteNotice && (
              <div className="zoom-inmeeting-toast">
                <MicOff size={15} color="#ef4444" />
                <span>{muteNotice}</span>
                <button
                  type="button"
                  className="zoom-toast-close"
                  onClick={() => setMuteNotice('')}
                  title="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            <div className="zoom-stage-center">
              {/* Screen Share Tile (if user is sharing screen) */}
              {screenSharing && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 12, background: '#000000' }}>
                  <video
                    ref={screenVideoRef}
                    muted
                    playsInline
                    autoPlay
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                  <span
                    className="tile-label"
                    style={{
                      position: 'absolute',
                      bottom: 16,
                      left: 16,
                      background: 'rgba(0,0,0,0.7)',
                      padding: '4px 8px',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Monitor size={12} style={{ color: '#38bdf8' }} />
                    Your screen share
                  </span>
                </div>
              )}

              {/* Stage View: Multi-Participant Grid or Solo Stage */}
              {otherPeople.length > 0 ? (
                <div className={`zoom-stage-grid count-${Math.min(4, otherPeople.length + 1)}`}>
                  {/* Local Participant Tile */}
                  <div className={`zoom-video-tile ${localSpeaking ? 'speaking' : ''}`}>
                    {screenSharing && screenStreamRef.current ? (
                      <video
                        ref={screenVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="zoom-tile-video"
                      />
                    ) : cameraOn ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="zoom-tile-video self"
                      />
                    ) : (
                      <div className="zoom-tile-avatar">
                        <div className="zoom-tile-avatar-card">
                          <span className="zoom-tile-initials">{getInitial(displayName || 'SD')}</span>
                        </div>
                      </div>
                    )}
                    <div className="zoom-tile-name-pill">
                      <span className={muted ? 'zoom-mic-slash-icon' : 'zoom-mic-live-icon'}>
                        {muted ? <MicOff size={13} /> : <Mic size={13} />}
                      </span>
                      <span>{displayName} (You)</span>
                    </div>
                  </div>

                  {/* Remote Participant Tiles */}
                  {otherPeople.map((p) => {
                    const remoteStream = remoteStreams[p.session_id];
                    const hasLiveVideoTrack = Boolean(
                      remoteStream &&
                        remoteStream.getVideoTracks().some(
                          (t) => t.enabled && !t.muted && t.readyState === 'live'
                        )
                    );
                    const hasPeerVideoState = peerMediaState[p.session_id]?.video ?? false;
                    const hasVideo = hasLiveVideoTrack || hasPeerVideoState;
                    const isSpeaking = peerSpeaking[p.session_id] ?? false;
                    const isMuted = !(peerMediaState[p.session_id]?.audio ?? true);

                    return (
                      <div
                        key={p.session_id}
                        className={`zoom-video-tile ${isSpeaking ? 'speaking' : ''}`}
                      >
                        {hasVideo ? (
                          <video
                            autoPlay
                            playsInline
                            ref={(el) => {
                              if (el) {
                                remoteVideoRefs.current.set(p.session_id, el);
                                if (remoteStream && el.srcObject !== remoteStream) {
                                  el.srcObject = remoteStream;
                                  el.play().catch(() => {});
                                }
                              } else {
                                remoteVideoRefs.current.delete(p.session_id);
                              }
                            }}
                            className="zoom-tile-video"
                          />
                        ) : (
                          <div className="zoom-tile-avatar">
                            <div className="zoom-tile-avatar-card">
                              <span className="zoom-tile-initials">{getInitial(p.display_name)}</span>
                            </div>
                          </div>
                        )}
                        <div className="zoom-tile-name-pill">
                          <span className={isMuted ? 'zoom-mic-slash-icon' : 'zoom-mic-live-icon'}>
                            {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
                          </span>
                          <span>{p.display_name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  {/* Live Camera Video (when camera is ON and solo) */}
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                    className="zoom-live-video-element"
                    style={{ display: cameraOn && !screenSharing ? 'block' : 'none' }}
                  />

                  {/* Centered Profile Initials Card (when camera is OFF and solo) */}
                  {!cameraOn && !screenSharing && (
                    <div className="zoom-center-avatar-wrap">
                      <div className="zoom-center-avatar-card">
                        <span className="zoom-center-avatar-initials">
                          {getInitial(displayName || 'SD')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Floating Bottom-Left Name Pill Badge */}
                  <div className="zoom-stage-name-pill">
                    <span className={muted ? 'zoom-mic-slash-icon' : 'zoom-mic-live-icon'}>
                      {muted ? <MicOff size={14} /> : <Mic size={14} />}
                    </span>
                    <span>{displayName}</span>
                  </div>
                </>
              )}

              {/* Background Audio playback for all remote participants */}
              <div style={{ display: 'none' }}>
                {otherPeople.map((p) => (
                  <audio
                    key={`remote-audio-${p.session_id}`}
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el) {
                        remoteAudioRefs.current.set(p.session_id, el);
                        const stream = remoteStreams[p.session_id];
                        if (stream && el.srcObject !== stream) {
                          el.srcObject = stream;
                          el.play().catch((err) => {
                            console.warn('Autoplay prevented on audio:', err);
                            setAudioBlocked(true);
                          });
                        }
                      } else {
                        remoteAudioRefs.current.delete(p.session_id);
                      }
                    }}
                  />
                ))}
              </div>

              {/* Floating Reaction Emojis */}
              {floatingReactions.map((r) => (
                <div
                  key={r.id}
                  className="zoom-floating-reaction"
                  style={{ left: `${r.left}%` }}
                >
                  {r.emoji}
                </div>
              ))}
            </div>

            {/* Side Panel: Participants Drawer */}
            {panelType === 'participants' && (
              <aside className="zoom-inmeeting-sidepanel">
                <div className="zoom-sidepanel-head">
                  <h3>Participants ({people.length || 1})</h3>
                  <button
                    className="zoom-sidepanel-close"
                    onClick={() => setPanelType(null)}
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="zoom-sidepanel-body">
                  {/* Current User */}
                  <div className="zoom-inmeeting-part-item">
                    <div className="zoom-part-info">
                      <div className="zoom-part-avatar">
                        {getInitial(displayName)}
                      </div>
                      <div>
                        <span className="zoom-part-name">{displayName}</span>
                        <span className="zoom-part-tag">{isHost ? '(Host, me)' : '(Me)'}</span>
                      </div>
                    </div>
                    <div className="zoom-part-controls">
                      {muted ? <MicOff size={14} color="#ef4444" /> : <Mic size={14} color="#22c55e" />}
                      {cameraOn ? <Video size={14} color="#ffffff" /> : <VideoOff size={14} color="#ef4444" />}
                    </div>
                  </div>

                  {/* Remote Peers */}
                  {otherPeople.map((p) => {
                    const isAudioOn = peerMediaState[p.session_id]?.audio ?? true;
                    const isVideoOn = peerMediaState[p.session_id]?.video ?? false;
                    return (
                      <div className="zoom-inmeeting-part-item" key={p.id}>
                        <div className="zoom-part-info">
                          <div className="zoom-part-avatar">
                            {getInitial(p.display_name)}
                          </div>
                          <div>
                            <span className="zoom-part-name">{p.display_name}</span>
                            {p.is_host && <span className="zoom-part-tag">(Host)</span>}
                          </div>
                        </div>
                        <div className="zoom-part-controls">
                          {isHost && !p.is_host && isAudioOn ? (
                            <button
                              type="button"
                              className="zoom-part-btn-mute"
                              onClick={() => handleMutePeer(p.session_id, p.display_name)}
                              title={`Click to mute ${p.display_name}`}
                            >
                              <Mic size={14} color="#22c55e" />
                              <span className="zoom-mute-hover-label">Mute</span>
                            </button>
                          ) : (
                            <span className="zoom-part-icon-wrap" title={isAudioOn ? 'Microphone on' : 'Muted'}>
                              {!isAudioOn ? <MicOff size={14} color="#ef4444" /> : <Mic size={14} color="#22c55e" />}
                            </span>
                          )}
                          {!isVideoOn ? <VideoOff size={14} color="#ef4444" /> : <Video size={14} color="#ffffff" />}
                          {isHost && !p.is_host && (
                            <button
                              title={`Remove ${p.display_name}`}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}
                              onClick={() => handleKick(p.id)}
                            >
                              <UserX size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="zoom-sidepanel-foot">
                  {isHost && (
                    <button
                      type="button"
                      className="zoom-mute-all-btn"
                      onClick={handleMuteAll}
                      title="Mute all participants"
                    >
                      <MicOff size={14} />
                      <span>Mute All</span>
                    </button>
                  )}
                  <button
                    className="zoom-copy-link-btn"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={copyInvite}
                  >
                    {copied ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
                    {copied ? 'Invite Copied!' : 'Copy Invite Link'}
                  </button>
                </div>
              </aside>
            )}

          </div>

          {/* Autoplay Blocked Toast */}
          {audioBlocked && (
            <div className="audio-blocked-toast" onClick={handleUserGesture} role="button" tabIndex={0}>
              <Volume2 size={16} style={{ color: '#38bdf8' }} />
              <span>Incoming audio is paused by your browser. Click anywhere to listen.</span>
            </div>
          )}

          {/* 3. In-Meeting Bottom Dock (Toolbar) */}
          <footer className="zoom-inmeeting-bottom-bar">
            {/* Left: Unmute & Video */}
            <div className="zoom-bottom-group">
              {/* Unmute/Mute */}
              <div style={{ position: 'relative' }}>
                <button
                  className={`zoom-dock-btn ${!muted ? 'active' : ''}`}
                  onClick={toggleMic}
                  title={muted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  <div className="zoom-dock-icon-box">
                    {muted ? (
                      <MicOff size={20} color="#ef4444" />
                    ) : (
                      <Mic size={20} color="#22c55e" />
                    )}
                  </div>
                  <span className="zoom-dock-label">
                    {muted ? 'Unmute' : 'Mute'}
                    <span
                      className="zoom-caret-mini"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAudioMenuOpen(!audioMenuOpen);
                      }}
                    >
                      ^
                    </span>
                  </span>
                </button>

                {/* Audio options popover */}
                {audioMenuOpen && (
                  <div className="zoom-inmeeting-popover">
                    <div className="zoom-popover-header">Select Microphone</div>
                    <div className="zoom-popover-item" onClick={() => setAudioMenuOpen(false)}>
                      <Check size={14} color="#22c55e" /> Default - Internal Microphone
                    </div>
                    <div className="zoom-popover-divider" />
                    <div className="zoom-popover-header">Select Speaker</div>
                    <div className="zoom-popover-item" onClick={() => setAudioMenuOpen(false)}>
                      <Check size={14} color="#22c55e" /> Same as System (Realtek Audio)
                    </div>
                    <div className="zoom-popover-divider" />
                    <div className="zoom-popover-item" onClick={() => { setAudioMenuOpen(false); setSettingsOpen(true); }}>
                      Audio Settings...
                    </div>
                  </div>
                )}
              </div>

              {/* Video / Stop Video */}
              <div style={{ position: 'relative' }}>
                <button
                  className={`zoom-dock-btn ${cameraOn ? 'active' : ''}`}
                  onClick={toggleCamera}
                  title={cameraOn ? 'Stop video' : 'Start video'}
                >
                  <div className="zoom-dock-icon-box">
                    {cameraOn ? (
                      <Video size={20} color="#ffffff" />
                    ) : (
                      <VideoOff size={20} color="#ef4444" />
                    )}
                  </div>
                  <span className="zoom-dock-label">
                    {cameraOn ? 'Stop Video' : 'Video'}
                    <span
                      className="zoom-caret-mini"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVideoMenuOpen(!videoMenuOpen);
                      }}
                    >
                      ^
                    </span>
                  </span>
                </button>

                {/* Video options popover */}
                {videoMenuOpen && (
                  <div className="zoom-inmeeting-popover">
                    <div className="zoom-popover-header">Select Camera</div>
                    <div className="zoom-popover-item" onClick={() => setVideoMenuOpen(false)}>
                      <Check size={14} color="#22c55e" /> Integrated Webcam (HD)
                    </div>
                    <div className="zoom-popover-divider" />
                    <div className="zoom-popover-item" onClick={() => setVideoMenuOpen(false)}>
                      Choose Virtual Background...
                    </div>
                    <div className="zoom-popover-item" onClick={() => { setVideoMenuOpen(false); setSettingsOpen(true); }}>
                      Video Settings...
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Center: Participants, Chat, React, Share, Host tools, More */}
            <div className="zoom-bottom-group center">
              {/* Participants */}
              <button
                className={`zoom-dock-btn ${panelType === 'participants' ? 'active' : ''}`}
                onClick={() => setPanelType(panelType === 'participants' ? null : 'participants')}
                title="Participants"
              >
                <div className="zoom-dock-icon-box">
                  <Users size={20} />
                </div>
                <span className="zoom-dock-label">
                  Participants {people.length || 1}
                  <span className="zoom-caret-mini">^</span>
                </span>
              </button>


              {/* React */}
              <div style={{ position: 'relative' }}>
                <button
                  className={`zoom-dock-btn ${reactMenuOpen ? 'active' : ''}`}
                  onClick={() => setReactMenuOpen(!reactMenuOpen)}
                  title="Reactions"
                >
                  <div className="zoom-dock-icon-box">
                    <Heart size={20} />
                  </div>
                  <span className="zoom-dock-label">React</span>
                </button>

                {reactMenuOpen && (
                  <div className="zoom-inmeeting-popover react-tray">
                    {['👏', '👍', '❤️', '😂', '😮', '🎉', '✋'].map((emoji) => (
                      <button
                        key={emoji}
                        className="zoom-react-emoji-btn"
                        onClick={() => sendReaction(emoji)}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Share */}
              <button
                className={`zoom-dock-btn ${screenSharing ? 'active' : ''}`}
                onClick={toggleScreenShare}
                title={screenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
              >
                <div className="zoom-dock-icon-box">
                  <div className="zoom-share-icon-wrap">
                    <ChevronUp size={16} strokeWidth={3} />
                  </div>
                </div>
                <span className="zoom-dock-label">
                  Share
                  <span className="zoom-caret-mini">^</span>
                </span>
              </button>

              {/* Host tools */}
              <div style={{ position: 'relative' }}>
                <button
                  className={`zoom-dock-btn ${hostMenuOpen ? 'active' : ''}`}
                  onClick={() => setHostMenuOpen(!hostMenuOpen)}
                  title="Host Security & Tools"
                >
                  <div className="zoom-dock-icon-box">
                    <ShieldCheck size={20} />
                  </div>
                  <span className="zoom-dock-label">
                    Host tools
                    <span className="zoom-caret-mini">^</span>
                  </span>
                </button>

                {hostMenuOpen && (
                  <div className="zoom-inmeeting-popover" style={{ minWidth: 240 }}>
                    <div className="zoom-popover-header">Security Controls</div>
                    <div className="zoom-popover-item" onClick={() => setHostMenuOpen(false)}>
                      <Check size={14} color="#22c55e" /> Lock Meeting
                    </div>
                    <div className="zoom-popover-item" onClick={() => setHostMenuOpen(false)}>
                      <Check size={14} color="#22c55e" /> Enable Waiting Room
                    </div>
                    <div className="zoom-popover-divider" />
                    <div className="zoom-popover-header">Allow Participants To:</div>
                    <div className="zoom-popover-item" onClick={() => setHostMenuOpen(false)}>
                      <Check size={14} color="#22c55e" /> Share Screen
                    </div>
                    <div className="zoom-popover-item" onClick={() => setHostMenuOpen(false)}>
                      <Check size={14} color="#22c55e" /> Unmute Themselves
                    </div>
                  </div>
                )}
              </div>

              {/* More */}
              <div style={{ position: 'relative' }}>
                <button
                  className={`zoom-dock-btn ${moreMenuOpen ? 'active' : ''}`}
                  onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                  title="More Options"
                >
                  <div className="zoom-dock-icon-box">
                    <MoreHorizontal size={20} />
                  </div>
                  <span className="zoom-dock-label">More</span>
                </button>

                {moreMenuOpen && (
                  <div className="zoom-inmeeting-popover">
                    <div className="zoom-popover-item" onClick={() => { setMoreMenuOpen(false); copyInvite(); }}>
                      <Copy size={14} /> Copy Invitation
                    </div>
                    <div className="zoom-popover-item" onClick={() => { setMoreMenuOpen(false); alert('Meeting recording has started.'); }}>
                      <Monitor size={14} /> Record to this Computer
                    </div>
                    <div className="zoom-popover-divider" />
                    <div className="zoom-popover-item" onClick={() => { setMoreMenuOpen(false); setSettingsOpen(true); }}>
                      <Settings size={14} /> Meeting Settings
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: End Button */}
            <div className="zoom-bottom-group">
              <button
                className="zoom-end-btn"
                onClick={() => setEndConfirmOpen(true)}
                title="End or Leave Meeting"
              >
                <div className="zoom-end-circle">
                  <X size={15} strokeWidth={3} />
                </div>
                <span className="zoom-end-label">End</span>
              </button>
            </div>
          </footer>

          {/* End Confirmation Modal */}
          {endConfirmOpen && (
            <div className="modal-backdrop" onClick={() => setEndConfirmOpen(false)}>
              <div className="zoom-end-confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <h3>End Meeting or Leave?</h3>
                <p>
                  To keep the meeting running, please assign a new host before leaving, or end the meeting for all participants.
                </p>
                <div className="zoom-end-dialog-actions">
                  {isHost && (
                    <button className="zoom-dialog-danger-btn" onClick={handleEnd}>
                      End Meeting for All
                    </button>
                  )}
                  <button className="zoom-dialog-secondary-btn" onClick={handleLeave}>
                    Leave Meeting
                  </button>
                  <button className="zoom-dialog-secondary-btn" onClick={() => setEndConfirmOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Settings Modal */}
          <SettingsModal
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        </main>
      </div>
    </div>
  );
}
