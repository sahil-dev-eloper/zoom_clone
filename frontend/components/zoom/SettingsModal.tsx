'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Settings,
  Headphones,
  Video,
  MessageSquare,
  User,
  Volume2,
  Camera,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'audio' | 'video' | 'chat' | 'account';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // General settings state (Screenshot 4)
  const [autoCall, setAutoCall] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('light');

  // Audio settings state
  const [testingSpeaker, setTestingSpeaker] = useState(false);
  const [micVolume, setMicVolume] = useState(45);

  // Video settings state
  const [mirrorVideo, setMirrorVideo] = useState(true);
  const [hdVideo, setHdVideo] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Clean up camera stream if open
  useEffect(() => {
    if (!cameraActive && videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }, [cameraActive]);

  const toggleCameraPreview = async () => {
    if (cameraActive) {
      setCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
      } catch (e) {
        alert('Could not access camera for preview.');
      }
    }
  };

  const playTestSpeaker = () => {
    setTestingSpeaker(true);
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
      setTimeout(() => {
        setTestingSpeaker(false);
      }, 500);
    } catch {
      setTestingSpeaker(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="zoom-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="zoom-settings-title"
    >
      <div
        className="zoom-settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="zoom-settings-header">
          <h2 id="zoom-settings-title">Settings</h2>
          <button
            className="zoom-settings-close"
            onClick={onClose}
            aria-label="Close Settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Left Tabs + Right Content */}
        <div className="zoom-settings-body">
          {/* Left Tabs Bar */}
          <div className="zoom-settings-tabs">
            <button
              className={`zoom-settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <Settings size={16} />
              <span>General</span>
            </button>

            <button
              className={`zoom-settings-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
              onClick={() => setActiveTab('audio')}
            >
              <Headphones size={16} />
              <span>Audio</span>
            </button>

            <button
              className={`zoom-settings-tab-btn ${activeTab === 'video' ? 'active' : ''}`}
              onClick={() => setActiveTab('video')}
            >
              <Video size={16} />
              <span>Video</span>
            </button>

            <button
              className={`zoom-settings-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <MessageSquare size={16} />
              <span>Chat</span>
            </button>

            <button
              className={`zoom-settings-tab-btn ${activeTab === 'account' ? 'active' : ''}`}
              onClick={() => setActiveTab('account')}
            >
              <User size={16} />
              <span>My account</span>
            </button>
          </div>

          {/* Right Content Pane */}
          <div className="zoom-settings-content">
            {/* 1. General Tab (Exact match to Screenshot 4) */}
            {activeTab === 'general' && (
              <div className="zoom-settings-pane">
                {/* Navigation Section */}
                <div className="zoom-settings-section">
                  <div className="zoom-settings-row-between">
                    <div>
                      <h4 className="zoom-sec-title">Navigation</h4>
                      <p className="zoom-sec-sub">Drag items to reorder the toolbar</p>
                    </div>
                    <button
                      className="zoom-link-btn"
                      onClick={() => alert('Navigation reset to default')}
                    >
                      Reset to default
                    </button>
                  </div>
                </div>

                {/* Auto-call Section */}
                <div className="zoom-settings-section" style={{ marginTop: 24 }}>
                  <h4 className="zoom-sec-title">Auto-call</h4>
                  <label className="zoom-checkbox-label">
                    <input
                      type="checkbox"
                      checked={autoCall}
                      onChange={(e) => setAutoCall(e.target.checked)}
                    />
                    <span>Automatically receive a call when a scheduled meeting starts</span>
                  </label>
                </div>

                {/* Theme Section */}
                <div className="zoom-settings-section" style={{ marginTop: 24 }}>
                  <h4 className="zoom-sec-title">Appearance</h4>
                  <div className="zoom-theme-options">
                    <label className="zoom-radio-label">
                      <input
                        type="radio"
                        name="theme"
                        checked={theme === 'light'}
                        onChange={() => setTheme('light')}
                      />
                      <span>Light</span>
                    </label>
                    <label className="zoom-radio-label">
                      <input
                        type="radio"
                        name="theme"
                        checked={theme === 'dark'}
                        onChange={() => setTheme('dark')}
                      />
                      <span>Dark</span>
                    </label>
                    <label className="zoom-radio-label">
                      <input
                        type="radio"
                        name="theme"
                        checked={theme === 'system'}
                        onChange={() => setTheme('system')}
                      />
                      <span>Use system settings</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Audio Tab */}
            {activeTab === 'audio' && (
              <div className="zoom-settings-pane">
                <div className="zoom-settings-section">
                  <h4 className="zoom-sec-title">Speaker</h4>
                  <div className="zoom-device-row">
                    <select className="zoom-select" defaultValue="default">
                      <option value="default">Default - System Headphones (Realtek High Definition)</option>
                      <option value="speakers">Speakers (Built-in Audio)</option>
                    </select>
                    <button
                      className="zoom-btn-outline sm"
                      onClick={playTestSpeaker}
                      disabled={testingSpeaker}
                    >
                      <Volume2 size={14} />
                      <span>{testingSpeaker ? 'Playing...' : 'Test Speaker'}</span>
                    </button>
                  </div>
                </div>

                <div className="zoom-settings-section" style={{ marginTop: 24 }}>
                  <h4 className="zoom-sec-title">Microphone</h4>
                  <div className="zoom-device-row">
                    <select className="zoom-select" defaultValue="default">
                      <option value="default">Default - Microphone Array (Intel Smart Sound)</option>
                      <option value="external">External USB Audio Device</option>
                    </select>
                  </div>

                  <div className="zoom-meter-box">
                    <span className="meter-label">Input Level:</span>
                    <div className="zoom-volume-meter">
                      <div
                        className="zoom-volume-fill"
                        style={{ width: `${micVolume}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="zoom-settings-section" style={{ marginTop: 24 }}>
                  <h4 className="zoom-sec-title">Suppress background noise</h4>
                  <select className="zoom-select" defaultValue="auto">
                    <option value="auto">Auto (Default)</option>
                    <option value="low">Low (Faint background sounds)</option>
                    <option value="medium">Medium (Computer fan, pen taps)</option>
                    <option value="high">High (Typing, dog barking)</option>
                  </select>
                </div>
              </div>
            )}

            {/* 3. Video Tab */}
            {activeTab === 'video' && (
              <div className="zoom-settings-pane">
                <div className="zoom-settings-section">
                  <h4 className="zoom-sec-title">Camera</h4>
                  <div className="zoom-device-row">
                    <select className="zoom-select" defaultValue="default">
                      <option value="default">Integrated Webcam (HD 720p)</option>
                      <option value="virtual">OBS Virtual Camera</option>
                    </select>
                    <button
                      className="zoom-btn-outline sm"
                      onClick={toggleCameraPreview}
                    >
                      <Camera size={14} />
                      <span>{cameraActive ? 'Stop Preview' : 'Test Video'}</span>
                    </button>
                  </div>

                  {/* Video Preview Box */}
                  <div className="zoom-video-preview-box">
                    {cameraActive ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`zoom-video-preview ${mirrorVideo ? 'mirror' : ''}`}
                      />
                    ) : (
                      <div className="zoom-video-preview-placeholder">
                        <Camera size={32} color="#94A3B8" />
                        <span>Click "Test Video" to test your camera</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="zoom-settings-section" style={{ marginTop: 16 }}>
                  <label className="zoom-checkbox-label">
                    <input
                      type="checkbox"
                      checked={mirrorVideo}
                      onChange={(e) => setMirrorVideo(e.target.checked)}
                    />
                    <span>Mirror my video</span>
                  </label>
                  <label className="zoom-checkbox-label" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={hdVideo}
                      onChange={(e) => setHdVideo(e.target.checked)}
                    />
                    <span>HD</span>
                  </label>
                </div>
              </div>
            )}

            {/* 4. Chat Tab */}
            {activeTab === 'chat' && (
              <div className="zoom-settings-pane">
                <div className="zoom-settings-section">
                  <h4 className="zoom-sec-title">Notifications</h4>
                  <label className="zoom-checkbox-label">
                    <input type="checkbox" defaultChecked />
                    <span>Play sound when a message is received</span>
                  </label>
                  <label className="zoom-checkbox-label" style={{ marginTop: 8 }}>
                    <input type="checkbox" defaultChecked />
                    <span>Show unread message badge on app icon</span>
                  </label>
                  <label className="zoom-checkbox-label" style={{ marginTop: 8 }}>
                    <input type="checkbox" defaultChecked />
                    <span>Show message preview in banner notifications</span>
                  </label>
                </div>
              </div>
            )}

            {/* 5. My Account Tab */}
            {activeTab === 'account' && (
              <div className="zoom-settings-pane">
                <div className="zoom-account-card">
                  <div className="zoom-avatar large">SD</div>
                  <div className="zoom-account-details">
                    <h3>Sahil Dargar</h3>
                    <p className="account-email">sahil@example.com</p>
                    <span className="account-badge">Licensed Pro Account</span>
                  </div>
                </div>

                <div className="zoom-settings-section" style={{ marginTop: 24 }}>
                  <h4 className="zoom-sec-title">Sign-in Capacity</h4>
                  <p className="zoom-sec-sub">Host up to 300 participants with unlimited meeting minutes.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
