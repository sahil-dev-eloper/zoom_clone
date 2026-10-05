'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, LoaderCircle, Mail, Lock, User as UserIcon, ArrowRight, Video } from 'lucide-react';
import { useAuth } from '@/lib/auth';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || searchParams.get('next') || '/';

  const { isLoggedIn, user, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isLoggedIn && user) {
      router.push(redirectUrl);
    }
  }, [isLoggedIn, user, redirectUrl, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      if (mode === 'login') {
        if (!email.trim() || !password) {
          setError('Please provide your email and password.');
          setBusy(false);
          return;
        }
        await login(email.trim(), password);
      } else {
        if (!email.trim() || !password || !displayName.trim()) {
          setError('Please fill in all fields.');
          setBusy(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setBusy(false);
          return;
        }
        await register(email.trim(), password, displayName.trim());
      }
      router.push(redirectUrl);
    } catch (err: unknown) {
      setBusy(false);
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
    <div className="modal" style={{ width: 'min(440px, 100%)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <a
          href="/"
          className="link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
          }}
        >
          <ArrowLeft size={14} />
          Back to workplace
        </a>

        <a
          href="/join"
          style={{
            color: '#0B5CFF',
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Join as guest
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            background: '#0B5CFF',
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: 18,
            padding: '4px 10px',
            borderRadius: 8,
            letterSpacing: '-0.03em',
          }}
        >
          zoom
        </span>
        <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Workplace
        </span>
      </div>

      <h1
        style={{
          fontSize: 24,
          letterSpacing: '-0.03em',
          margin: '12px 0 6px',
        }}
      >
        {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
      </h1>

      <p
        style={{
          color: 'var(--muted)',
          fontSize: 13.5,
          marginBottom: 20,
        }}
      >
        {mode === 'login'
          ? 'Enter your credentials to manage your meetings and preferences.'
          : 'Sign up to host meetings, schedule calls, and sync calendars.'}
      </p>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #E2E8F0',
          marginBottom: 20,
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
            padding: '10px',
            border: 'none',
            background: 'transparent',
            fontWeight: mode === 'login' ? 700 : 500,
            color: mode === 'login' ? '#0B5CFF' : '#64748B',
            borderBottom: mode === 'login' ? '2px solid #0B5CFF' : 'none',
            cursor: 'pointer',
            fontSize: 13.5,
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
            padding: '10px',
            border: 'none',
            background: 'transparent',
            fontWeight: mode === 'register' ? 700 : 500,
            color: mode === 'register' ? '#0B5CFF' : '#64748B',
            borderBottom: mode === 'register' ? '2px solid #0B5CFF' : 'none',
            cursor: 'pointer',
            fontSize: 13.5,
          }}
        >
          Create Account
        </button>
      </div>

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
          disabled={busy}
          style={{
            height: 42,
            background: '#0B5CFF',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            cursor: busy ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 6,
          }}
        >
          {busy ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <>
              <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      <div
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: '1px solid #F1F5F9',
          textAlign: 'center',
        }}
      >
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

      <div style={{ marginTop: 24, textAlign: 'center', borderTop: '1px solid #F1F5F9', paddingTop: 16 }}>
        <a
          href="/join"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: '#64748B',
            fontSize: 13,
            textDecoration: 'none',
          }}
        >
          <Video size={14} color="#0B5CFF" />
          <span>Have an invite link? <strong>Join meeting as guest</strong></span>
        </a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="page-center">
      <Suspense
        fallback={
          <div className="modal" style={{ textAlign: 'center', padding: 40 }}>
            <LoaderCircle size={28} className="spin" />
          </div>
        }
      >
        <LoginFormContent />
      </Suspense>
    </main>
  );
}
