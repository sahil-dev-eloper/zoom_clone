'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  Download,
  User,
  LogOut,
  Check,
  LogIn,
  Pencil,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { AuthModal } from './AuthModal';

interface ZoomHeaderProps {
  onNavigateTab?: (tab: string) => void;
}

export function ZoomHeader({
  onNavigateTab,
}: ZoomHeaderProps) {
  const { user, isLoggedIn, logout, updateDisplayName } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState(false);

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) {
      setNameError('Display name cannot be empty');
      return;
    }
    setSavingName(true);
    setNameError('');
    try {
      await updateDisplayName(trimmed);
      setIsEditingName(false);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update name';
      setNameError(msg);
    } finally {
      setSavingName(false);
    }
  };

  const initials = user?.display_name
    ? user.display_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'SD';

  return (
    <header className="zoom-topbar">
      {/* Left: Brand & Main Nav */}
      <div className="zoom-topbar-left">
        <div
          className="zoom-brand-group"
          onClick={() => onNavigateTab?.('home')}
          title="Zoom Workplace Home"
        >
          <span className="zoom-brand-word">zoom</span>
          <span className="zoom-brand-sub">Workplace</span>
        </div>

        <div className="zoom-nav-links">
          <div className="zoom-dropdown-trigger" onClick={() => setProductsOpen(!productsOpen)}>
            <span>Discover Products</span>
            <ChevronDown size={14} className={productsOpen ? 'rotate-180' : ''} />
            {productsOpen && (
              <div className="zoom-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                <div className="zoom-dropdown-header">Workplace Products</div>
                <div className="zoom-dropdown-item active">
                  <strong>Zoom Meetings</strong>
                  <span>HD video, audio and screen sharing</span>
                </div>
                <div className="zoom-dropdown-item">
                  <strong>Zoom Rooms</strong>
                  <span>Conference rooms & hybrid workspaces</span>
                </div>
                <div className="zoom-dropdown-item">
                  <strong>AI Companion</strong>
                  <span>Generative AI for summaries & notes</span>
                </div>
              </div>
            )}
          </div>

          <a
            href="https://zoom.us/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="zoom-nav-link"
          >
            Pricing
          </a>
        </div>
      </div>

      {/* Right: Actions, Notifications, Profile */}
      <div className="zoom-topbar-right">
        <a
          href="https://zoom.us/download"
          target="_blank"
          rel="noopener noreferrer"
          className="zoom-download-btn"
          title="Download Zoom App"
        >
          <Download size={14} className="download-icon" />
          <span>Download</span>
        </a>

        <a
          href="https://zoom.us/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="zoom-upgrade-btn"
          title="Upgrade Account"
        >
          Upgrade
        </a>

        {/* Sign In Button if not logged in */}
        {!isLoggedIn && (
          <button
            className="zoom-signin-header-btn"
            onClick={() => setAuthModalOpen(true)}
            title="Sign in to your Zoom account"
          >
            <LogIn size={14} />
            <span>Sign In</span>
          </button>
        )}

        {/* Profile Avatar */}
        <div className="zoom-popover-anchor">
          <button
            className="zoom-avatar-button"
            onClick={() => {
              setProfileOpen(!profileOpen);
              setIsEditingName(false);
              setNameError('');
            }}
            title={user ? user.display_name : 'Guest Account - Click to sign in'}
            aria-label="User profile menu"
          >
            <div className="zoom-avatar">
              {user ? (
                <span className="zoom-avatar-fallback">{initials}</span>
              ) : (
                <User size={16} />
              )}
            </div>
          </button>

          {profileOpen && (
            <div className="zoom-dropdown-menu profile-menu" onClick={(e) => e.stopPropagation()}>
              {user ? (
                <>
                  <div className="zoom-profile-card">
                    <div className="zoom-avatar large">
                      <span>{initials}</span>
                    </div>
                    <div className="zoom-profile-info">
                      <h4>{user.display_name}</h4>
                      <p>{user.email}</p>
                    </div>
                  </div>

                  {nameSuccess && (
                    <div style={{ padding: '6px 10px', fontSize: 12, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                      <Check size={14} /> Display name updated
                    </div>
                  )}

                  {isEditingName ? (
                    <form
                      onSubmit={handleSaveDisplayName}
                      className="zoom-name-edit-form"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="zoom-edit-label">Display Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => {
                          setEditName(e.target.value);
                          setNameError('');
                        }}
                        className="zoom-edit-input"
                        placeholder="Enter display name"
                        autoFocus
                        disabled={savingName}
                      />
                      {nameError && (
                        <p style={{ color: '#EF4444', fontSize: 11, margin: '4px 0 0' }}>{nameError}</p>
                      )}
                      <div className="zoom-edit-actions">
                        <button
                          type="submit"
                          disabled={savingName || !editName.trim()}
                          className="zoom-btn-save"
                        >
                          {savingName ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingName(false);
                            setNameError('');
                          }}
                          className="zoom-btn-cancel"
                          disabled={savingName}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div
                      className="zoom-menu-row"
                      onClick={() => {
                        setEditName(user.display_name);
                        setIsEditingName(true);
                        setNameSuccess(false);
                        setNameError('');
                      }}
                    >
                      <Pencil size={15} />
                      <span>Edit Display Name</span>
                    </div>
                  )}

                  <div className="zoom-menu-divider" />

                  <div
                    className="zoom-menu-row danger"
                    onClick={() => {
                      setProfileOpen(false);
                      setIsEditingName(false);
                      logout();
                    }}
                  >
                    <LogOut size={16} />
                    <span>Log Out</span>
                  </div>
                </>
              ) : (
                <div className="zoom-profile-card">
                  <div className="zoom-avatar large" style={{ background: '#64748B' }}>
                    <User size={22} />
                  </div>
                  <div className="zoom-profile-info">
                    <h4>Guest User</h4>
                    <p>Not signed in</p>
                    <button
                      className="zoom-signin-header-btn"
                      style={{ marginTop: 6, width: '100%', justifyContent: 'center' }}
                      onClick={() => {
                        setProfileOpen(false);
                        setAuthModalOpen(true);
                      }}
                    >
                      <LogIn size={13} />
                      <span>Sign In / Register</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </header>
  );
}
