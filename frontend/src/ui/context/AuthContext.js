import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS, isValidHcmsRole, ROLE_DASHBOARD_ROUTE } from '../modules/auth/constants';

const AuthContext = createContext(null);

/** Decode a JWT payload without verification (safe for expiry checks). */
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Restore session from storage on mount. */
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN) || sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const storedUser = localStorage.getItem(STORAGE_KEYS.USER) || sessionStorage.getItem(STORAGE_KEYS.USER);

      if (storedToken && storedUser) {
        const payload = decodeJwtPayload(storedToken);
        if (payload && payload.exp && Date.now() < payload.exp * 1000) {
          const parsedUser = JSON.parse(storedUser);
          if (isValidHcmsRole(parsedUser.role)) {
            setToken(storedToken);
            setUser(parsedUser);
          }
        }
      }
    } catch (e) {
      console.warn('[AuthContext] restore failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Persist token + user to both storage layers. */
  const persist = useCallback((newToken, newUser) => {
    const userJson = JSON.stringify(newUser);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    [localStorage, sessionStorage].forEach((s) => {
      s.setItem(STORAGE_KEYS.TOKEN, newToken);
      s.setItem(STORAGE_KEYS.USER, userJson);
      s.setItem(STORAGE_KEYS.LOGIN_TIMESTAMP, expiresAt);
    });
  }, []);

  const login = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    persist(newToken, newUser);
  }, [persist]);

  const logout = useCallback(() => {
    [localStorage, sessionStorage].forEach((s) => {
      s.removeItem(STORAGE_KEYS.TOKEN);
      s.removeItem(STORAGE_KEYS.USER);
      s.removeItem(STORAGE_KEYS.LOGIN_TIMESTAMP);
    });
    setToken(null);
    setUser(null);
  }, []);

  /** Re-fetch current user from /api/v2/auth/me to ensure token is still valid server-side. */
  const refreshUser = useCallback(async () => {
    const currentToken = token || localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!currentToken) return null;
    try {
      const res = await fetch('/api/v2/auth/me', {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      if (!res.ok) {
        if (res.status === 401) logout();
        return null;
      }
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        persist(currentToken, data.user);
        return data.user;
      }
    } catch (e) {
      console.warn('[AuthContext] refreshUser failed:', e);
    }
    return null;
  }, [token, logout, persist]);

  const value = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    login,
    logout,
    refreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
