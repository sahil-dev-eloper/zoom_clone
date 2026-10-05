'use client';

import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, LoaderCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
}

export function AuthModal({
  isOpen,
  onClose,
  initialMode = 'login',
  title,
  subtitle,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const { login, register } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        if (!email.trim() || !password) {
          setError('Please provide your email and password.');
          setLoading(false);
          return;
        }
        await login(email.trim(), password);
        setSuccessMsg('Signed in successfully!');
      } else {
        if (!email.trim() || !password || !displayName.trim()) {
          setError('Please fill in all required fields.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        await register(email.trim(), password, displayName.trim());
        setSuccessMsg('Account created successfully!');
      }

      setTimeout(() => {
        setLoading(false);
        onSuccess?.();
        onClose();
      }, 500);
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
    }
  };

  const handleFillDemo = () => {
    setMode('login');
    setEmail('sahil@example.com');
    setPassword('sahil123');
    setError('');
  };

  return (
    <div className="zoom-modal-backdrop" onClick={onClose}>
      <div
        className="zoom-auth-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          background: '#FFFFFF',
          borderRadius: 12,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          animation: 'scaleIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid #EAEDF1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                background: '#0B5CFF',
                color: '#FFFFFF',
                fontWeight: 800,
                fontSize: 14,
                padding: '3px 8px',
                borderRadius: 6,
                letterSpacing: '-0.02em',
              }}
            >
              zoom
            </span>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
                {title || (mode === 'login' ? 'Sign in to Zoom' : 'Create an Account')}
              </h3>
              {subtitle && (
                <p style={{ fontSize: 12, color: '#64748B', margin: '3px 0 0' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #EAEDF1',
            background: '#F8FAFC',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            style={{
              flex: 1,
              padding: '11px',
              border: 'none',
              background: mode === 'login' ? '#FFFFFF' : 'transparent',
              fontWeight: mode === 'login' ? 700 : 500,
              color: mode === 'login' ? '#0B5CFF' : '#64748B',
              borderBottom: mode === 'login' ? '2px solid #0B5CFF' : 'none',
              cursor: 'pointer',
              fontSize: 13.5,
              transition: 'all 0.15s ease',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            style={{
              flex: 1,
              padding: '11px',
              border: 'none',
              background: mode === 'register' ? '#FFFFFF' : 'transparent',
              fontWeight: mode === 'register' ? 700 : 500,
              color: mode === 'register' ? '#0B5CFF' : '#64748B',
              borderBottom: mode === 'register' ? '2px solid #0B5CFF' : 'none',
              cursor: 'pointer',
              fontSize: 13.5,
              transition: 'all 0.15s ease',
            }}
          >
            Sign Up
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {error && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#EF4444',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#059669',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CheckCircle2 size={16} />
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                  Your Display Name
                </label>
                <div style={{ position: 'relative' }}>
                  <UserIcon size={16} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Sahil Dargar"
                    required
                    style={{
                      width: '100%',
                      height: 40,
                      padding: '0 12px 0 38px',
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      fontSize: 13.5,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  style={{
                    width: '100%',
                    height: 40,
                    padding: '0 12px 0 38px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 12 }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%',
                    height: 40,
                    padding: '0 12px 0 38px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                height: 42,
                background: '#0B5CFF',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 6,
                transition: 'background 0.15s ease',
              }}
            >
              {loading ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Login Option */}
          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid #F1F5F9',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
              Want to test quickly?
            </div>
            <button
              type="button"
              onClick={handleFillDemo}
              style={{
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#0B5CFF',
                fontSize: 12.5,
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Auto-fill Demo Account (Sahil Dargar)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
