'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AuthUser, AuthResult } from '@/types';
import { api } from '@/lib/api';

const TOKEN_KEY = 'zoom_auth_token';
const USER_KEY = 'zoom_auth_user';
const AUTH_EVENT = 'zoom-auth-changed';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: AuthUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { token, user } }));
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { token: null, user: null } }));
}

/**
 * React hook to access authentication status, user profile, and actions.
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Sync state on external auth changes
  const syncState = useCallback(() => {
    setUser(getStoredUser());
    setToken(getAuthToken());
  }, []);

  useEffect(() => {
    syncState();
    setIsMounted(true);
    window.addEventListener(AUTH_EVENT, syncState);
    window.addEventListener('storage', syncState);

    // Verify token with backend
    const currentToken = getAuthToken();
    if (currentToken) {
      api.auth
        .me()
        .then((fetchedUser) => {
          localStorage.setItem(USER_KEY, JSON.stringify(fetchedUser));
          setUser(fetchedUser);
        })
        .catch(() => {
          // Token expired or invalid
          clearAuth();
          setUser(null);
          setToken(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      window.removeEventListener(AUTH_EVENT, syncState);
      window.removeEventListener('storage', syncState);
    };
  }, [syncState]);

  const login = async (email: string, password: string): Promise<AuthResult> => {
    const res = await api.auth.login(email, password);
    setAuth(res.token, res.user);
    return res;
  };

  const register = async (email: string, password: string, displayName: string): Promise<AuthResult> => {
    const res = await api.auth.register(email, password, displayName);
    setAuth(res.token, res.user);
    return res;
  };

  const logout = () => {
    clearAuth();
  };

  const updateDisplayName = async (displayName: string): Promise<AuthUser> => {
    const updated = await api.auth.updateProfile(displayName);
    const currentToken = getAuthToken();
    if (currentToken) {
      setAuth(currentToken, updated);
    }
    setUser(updated);
    return updated;
  };

  return {
    user,
    token,
    isLoggedIn: isMounted && !!user,
    isMounted,
    loading,
    login,
    register,
    logout,
    updateDisplayName,
  };
}
