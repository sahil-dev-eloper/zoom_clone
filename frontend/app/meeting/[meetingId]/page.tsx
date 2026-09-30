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
} from 'lucide-react';

import { api, getWsBaseUrl } from '@/lib/api';
import type { Meeting, Participant } from '@/types';
import { Brand } from '@/components/Brand';

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

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
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
  const initialName = query.get('name') || '';
  const initialSession = query.get('session') || '';
  const initialHost = query.get('host') === 'true';

  // Session & Identity State
  const [displayName, setDisplayName] = useState(initialName);
  const [sessionId, setSessionId] = useState(initialSession);
  const [isHost, setIsHost] = useState(initialHost);
  const [joinPromptName, setJoinPromptName] = useState(initialName || '');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

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
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load meeting details.'
      );
    }
  }, [meetingId]);

  // ---- Load participants & detect kicked ----

  const loadParticipants = useCallback(async () => {
    try {
      const parts = await api.participants(meetingId);
      setPeople(parts);
      setHasLoadedInitialParticipants(true);

      if (sessionIdRef.current) {
        const stillInRoom = parts.some(
          (p) => p.session_id === sessionIdRef.current && p.left_at === null
        );
        if (hasLoadedInitialParticipants && !stillInRoom) {
          setKicked(true);
        }
      }
    } catch {
      // Silent fail for polling
    }
  }, [meetingId, hasLoadedInitialParticipants]);

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

    pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current.set(targetPeerId, pc);

    // Pre-allocate audio & video transceivers with sendrecv so m-lines are negotiated immediately
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });

    // Attach active tracks if present
    if (audioStreamRef.current && audioStreamRef.current.getAudioTracks().length > 0) {
      const aTrack = audioStreamRef.current.getAudioTracks()[0];
      if (aTrack && aTrack.readyState === 'live') {
        audioTransceiver.sender.replaceTrack(aTrack).catch(console.warn);
      }
    }
    if (videoStreamRef.current && videoStreamRef.current.getVideoTracks().length > 0) {
      const vTrack = videoStreamRef.current.getVideoTracks()[0];
      if (vTrack && vTrack.readyState === 'live') {
        videoTransceiver.sender.replaceTrack(vTrack).catch(console.warn);
      }
    }

    // ICE Candidate exchange
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
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
      console.log('Remote track received:', track.kind, track.id, 'from', targetPeerId);

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

      const onTrackChange = () => setStreamVersion((v) => v + 1);
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
      console.log(`ICE Connection State for ${targetPeerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    // If initiator, create and send initial offer
    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN && pc.localDescription) {
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
        .catch((err) => console.warn('WebRTC offer error:', err));
    }

    return pc;
  }, [attachRemoteAnalyser]);

  // Keep a ref to createPeerConnection so useEffect doesn't tear down on changes
  const createPeerConnectionRef = useRef(createPeerConnection);
  createPeerConnectionRef.current = createPeerConnection;

  // ---- WebSocket Signaling (Runs ONLY for session lifecycle) ----

  useEffect(() => {
    if (!sessionId || !meetingId) return;

    const wsUrl = getWsBaseUrl(meetingId);
    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('WebSocket connected to Zooom signaling:', wsUrl);
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

          if (msg.type === 'peers') {
            if (Array.isArray(msg.peerIds)) {
              msg.peerIds.forEach((pid: string) => {
                if (pid && pid !== sessionId) {
                  createPeerConnectionRef.current(pid, true);
                }
              });
            }
            loadParticipants();

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
            loadParticipants();
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
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

            // Attach active local tracks to matched transceivers
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
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
            }
            pendingCandidatesRef.current[msg.peerId] = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (wsRef.current?.readyState === WebSocket.OPEN && pc.localDescription) {
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
              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              const queued = pendingCandidatesRef.current[msg.peerId] || [];
              for (const cand of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
              }
              pendingCandidatesRef.current[msg.peerId] = [];
            }
          } else if (msg.type === 'candidate') {
            const pc = peerConnectionsRef.current.get(msg.peerId);
            if (pc && msg.candidate) {
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(console.warn);
              } else {
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
          } else if (msg.type === 'speaking') {
            setPeerSpeaking((prev) => ({
              ...prev,
              [msg.peerId]: !!msg.speaking,
            }));
          } else if (msg.type === 'peer-left') {
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
            delete remoteMediaStreamsRef.current[msg.peerId];
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
            loadParticipants();
          }
        } catch (err) {
          console.warn('WebRTC signaling message handling error:', err);
        }
      };
    } catch {
      // WebSocket fallback
    }

    return () => {
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
  }, [sessionId, meetingId, loadParticipants]);

  // ---- Handle Lobby Direct Join ----

  const handleLobbyJoin = async () => {
    if (!joinPromptName.trim() || joinPromptName.trim().length < 2) {
      setJoinError('Please enter your display name (at least 2 characters).');
      return;
    }

    setJoining(true);
    setJoinError('');

    try {
      const res = await api.join({
        meeting_id: meetingId,
        display_name: joinPromptName.trim(),
      });
      setSessionId(res.session_id);
      setDisplayName(joinPromptName.trim());
      setIsHost(res.is_host);
      setMeeting(res.meeting);
      const newUrl = `/meeting/${meetingId}?session=${res.session_id}&name=${encodeURIComponent(joinPromptName.trim())}${res.is_host ? '&host=true' : ''}`;
      window.history.replaceState(null, '', newUrl);
    } catch (e) {
      setJoinError(
        e instanceof Error ? e.message : 'Unable to join meeting.'
      );
    } finally {
      setJoining(false);
    }
  };

  // ---- Media controls (Camera & Mic with replaceTrack) ----

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
        peerConnectionsRef.current.forEach((pc) => {
          const vSender = getMediaSender(pc, 'video');
          if (vSender) {
            vSender.replaceTrack(videoTrack).catch(console.warn);
          } else {
            pc.addTrack(videoTrack, stream);
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

        peerConnectionsRef.current.forEach((pc) => {
          const aSender = getMediaSender(pc, 'audio');
          if (aSender) {
            aSender.replaceTrack(audioTrack).catch(console.warn);
          } else {
            pc.addTrack(audioTrack, stream!);
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
            console.warn('Local audio analyser setup error:', e);
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

      stream.getVideoTracks()[0].onended = () => {
        setScreenSharing(false);
        screenStreamRef.current = null;
      };
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

  // ---- Copy invitation ----

  const copyInvite = async () => {
    if (!meeting) return;
    try {
      await navigator.clipboard?.writeText(meeting.invite_url);
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
            onClick={handleLobbyJoin}
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

  const otherPeople = people.filter(
    (p) => p.session_id !== sessionId
  );
  const totalTiles = 1 + otherPeople.length + (screenSharing ? 1 : 0);
  const gridClass =
    totalTiles <= 1
      ? 'video-grid solo'
      : totalTiles <= 2
        ? 'video-grid'
        : totalTiles <= 4
          ? 'video-grid four'
          : 'video-grid';

  // ---- Render: Active Zooom Meeting Room ----

  return (
    <main className="meeting-room">
      {/* Top bar */}
      <header className="room-top">
        <div className="room-brand">
          <Brand variant="dark" size="sm" />
          <small style={{ color: '#64748b' }}>/ {meeting.title}</small>
        </div>

        <div className="room-info">
          <span className="meeting-id-badge">
            Room {meeting.meeting_id}
          </span>
          <span>
            {people.length || 1} participant
            {(people.length || 1) !== 1 ? 's' : ''}
          </span>
          <button className="tool" title="Room settings" aria-label="Settings">
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Media error banner */}
      {mediaError && (
        <div
          style={{
            background: 'rgba(234, 88, 12, 0.1)',
            borderBottom: '1px solid rgba(234, 88, 12, 0.2)',
            padding: '8px 24px',
            fontSize: 12,
            color: '#fb923c',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={14} />
          {mediaError}
          <button
            className="link"
            style={{ marginLeft: 'auto', color: '#fb923c', fontSize: 11 }}
            onClick={() => setMediaError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Ended banner */}
      {meeting.status === 'ended' && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
            padding: '10px 24px',
            fontSize: 13,
            color: '#f87171',
            textAlign: 'center',
          }}
        >
          This meeting has ended.{' '}
          <a href="/" className="link" style={{ color: '#f87171' }}>
            Return home →
          </a>
        </div>
      )}

      {/* Main content */}
      <div className="room-content">
        {/* Video grid */}
        <section className={gridClass}>
          {/* Screen share tile (if active) */}
          {screenSharing && (
            <div className="tile" style={{ background: '#090d16' }}>
              <video
                ref={screenVideoRef}
                muted
                playsInline
                autoPlay
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
              <span className="tile-label">
                <Monitor size={12} style={{ color: '#38bdf8' }} />
                Your screen share
              </span>
            </div>
          )}

          {/* Self video/avatar tile */}
          <div className="tile self">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
                display: cameraOn ? 'block' : 'none',
              }}
            />
            {!cameraOn && (
              <div className="tile-avatar">
                {getInitial(displayName)}
              </div>
            )}
            <span className="tile-label">
              <span
                className={muted ? 'mic-off-indicator' : 'mic-indicator'}
              />
              {displayName} (You){isHost ? ' · Host' : ''}
              {!muted && (
                <span
                  className={`voice-wave ${localSpeaking ? 'speaking' : ''}`}
                  title={localSpeaking ? `Speaking (Level: ${localVolume}%)` : 'Microphone active'}
                >
                  <span
                    className="voice-wave-bar"
                    style={{
                      height: localSpeaking ? Math.max(4, Math.round((localVolume / 100) * 14)) : 4,
                    }}
                  />
                  <span
                    className="voice-wave-bar"
                    style={{
                      height: localSpeaking ? Math.max(4, Math.round((localVolume / 100) * 18)) : 4,
                    }}
                  />
                  <span
                    className="voice-wave-bar"
                    style={{
                      height: localSpeaking ? Math.max(4, Math.round((localVolume / 100) * 12)) : 4,
                    }}
                  />
                </span>
              )}
              {localSpeaking && <span className="voice-status-pill">Speaking</span>}
            </span>
            {localSpeaking && <span className="speaking-ring" />}
          </div>

          {/* ALL other participants in the meeting (No slice limits) */}
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
            const peerAudioState = peerMediaState[p.session_id]?.audio;
            const hasLiveAudioTrack = Boolean(
              remoteStream &&
              remoteStream.getAudioTracks().some(
                (t) => t.enabled && !t.muted && t.readyState === 'live'
              )
            );
            const isAudioOn = peerAudioState !== undefined ? peerAudioState : hasLiveAudioTrack;

            return (
              <div className="tile" key={p.id}>
                {/* Audio element for remote audio */}
                <audio
                  autoPlay
                  playsInline
                  ref={(el) => {
                    if (el) {
                      remoteAudioRefs.current.set(p.session_id, el);
                      if (remoteStream && el.srcObject !== remoteStream) {
                        el.srcObject = remoteStream;
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

                {/* Always-mounted Video element for instant display */}
                <video
                  autoPlay
                  playsInline
                  muted
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
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: hasVideo ? 'block' : 'none',
                  }}
                />

                {!hasVideo && (
                  <div className="tile-avatar">
                    {getInitial(p.display_name)}
                  </div>
                )}

                <span className="tile-label">
                  <span className={!isAudioOn ? 'mic-off-indicator' : 'mic-indicator'} />
                  {p.display_name}
                  {p.is_host ? ' · Host' : ''}
                  {isAudioOn && (
                    <span className={`voice-wave ${isSpeaking ? 'speaking' : ''}`}>
                      <span className="voice-wave-bar" />
                      <span className="voice-wave-bar" />
                      <span className="voice-wave-bar" />
                    </span>
                  )}
                  {isSpeaking && <span className="voice-status-pill">Speaking</span>}
                </span>

                {isSpeaking && <span className="speaking-ring" />}
              </div>
            );
          })}
        </section>

        {/* Side panel */}
        {panelOpen && (
          <aside className="side-panel">
            <h3>
              Participants{' '}
              <span style={{ color: '#64748b', fontWeight: 400 }}>
                ({people.length || 1})
              </span>
            </h3>
            <p className="side-panel-note">
              Invite people to this Zooom room using the invitation link below.
            </p>

            {/* Participant list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Self */}
              <div className="participant-item">
                <span className="mini-avatar">
                  {getInitial(displayName)}
                </span>
                <div className="participant-info">
                  <div className="name">{displayName} (You)</div>
                  {isHost && <div className="role">Host</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {localSpeaking && (
                    <span className="voice-status-pill" style={{ fontSize: 10, padding: '1px 5px' }}>
                      Speaking
                    </span>
                  )}
                  {muted ? (
                    <MicOff size={14} style={{ color: '#ef4444' }} />
                  ) : (
                    <Volume2
                      size={14}
                      style={{
                        color: localSpeaking ? '#22c55e' : '#64748b',
                        filter: localSpeaking ? 'drop-shadow(0 0 4px #22c55e)' : 'none',
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Others */}
              {otherPeople.map((p) => {
                const isAudioOn = peerMediaState[p.session_id]?.audio ?? true;
                const isSpeaking = peerSpeaking[p.session_id] ?? false;
                return (
                  <div className="participant-item" key={p.id}>
                    <span className="mini-avatar">
                      {getInitial(p.display_name)}
                    </span>
                    <div className="participant-info">
                      <div className="name">{p.display_name}</div>
                      {p.is_host && <div className="role">Host</div>}
                    </div>
                    <div className="participant-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isSpeaking && (
                        <span className="voice-status-pill" style={{ fontSize: 10, padding: '1px 5px' }}>
                          Speaking
                        </span>
                      )}
                      {!isAudioOn ? (
                        <MicOff size={14} style={{ color: '#ef4444' }} />
                      ) : (
                        <Volume2
                          size={14}
                          style={{
                            color: isSpeaking ? '#22c55e' : '#64748b',
                            filter: isSpeaking ? 'drop-shadow(0 0 4px #22c55e)' : 'none',
                          }}
                        />
                      )}
                      {isHost && !p.is_host && (
                        <button
                          title={`Remove ${p.display_name}`}
                          aria-label={`Remove ${p.display_name}`}
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

            {/* Invite section */}
            <div className="invite-section">
              <p>Share this link to invite others to Zooom:</p>
              <div className="invite-input-row">
                <input
                  readOnly
                  value={meeting.invite_url}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  aria-label="Invitation URL"
                />
                <button onClick={copyInvite} aria-label="Copy invitation link">
                  {copied ? (
                    <>
                      <Check size={12} style={{ marginRight: 4 }} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={12} style={{ marginRight: 4 }} />
                      Copy
                    </>
                  )}
                </button>
              </div>
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

      {/* Bottom toolbar */}
      <footer className="room-bottom">
        <button
          className={`tool ${!muted ? 'active' : ''}`}
          onClick={toggleMic}
          title={muted ? 'Unmute microphone' : localSpeaking ? 'Microphone active (Speaking)' : 'Mute microphone'}
          aria-label={muted ? 'Unmute' : 'Mute'}
          style={{
            position: 'relative',
            boxShadow: !muted && localSpeaking ? '0 0 14px rgba(34, 197, 94, 0.6)' : undefined,
            borderColor: !muted && localSpeaking ? '#22c55e' : undefined,
          }}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
          {!muted && localSpeaking && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 6px #22c55e',
              }}
            />
          )}
        </button>

        <button
          className={`tool ${cameraOn ? 'active' : ''}`}
          onClick={toggleCamera}
          title={cameraOn ? 'Turn off camera' : 'Turn on camera'}
          aria-label={cameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>

        <button
          className={`tool ${screenSharing ? 'active' : ''}`}
          onClick={toggleScreenShare}
          title={screenSharing ? 'Stop sharing screen' : 'Share screen'}
          aria-label="Share screen"
        >
          <Monitor size={18} />
        </button>

        <button
          className={`tool ${panelOpen ? 'active' : ''}`}
          onClick={() => setPanelOpen(!panelOpen)}
          title="Toggle participants panel"
          aria-label="Toggle participants panel"
        >
          <Users size={18} />
        </button>

        <button
          className="tool"
          onClick={copyInvite}
          title="Share invitation link"
          aria-label="Copy invitation link"
        >
          <Share2 size={18} />
        </button>

        {/* Leave button */}
        <button
          className="tool-leave"
          onClick={handleLeave}
          disabled={leaving}
          title="Leave meeting"
          aria-label="Leave meeting"
        >
          <PhoneOff size={16} />
          <span>Leave</span>
        </button>

        {/* End meeting (host only) */}
        {isHost && meeting.status !== 'ended' && (
          <button
            className="tool-end"
            onClick={handleEnd}
            disabled={leaving}
            title="End meeting for all participants"
            aria-label="End meeting for all"
          >
            <PhoneOff size={14} />
            End
          </button>
        )}
      </footer>
    </main>
  );
}
