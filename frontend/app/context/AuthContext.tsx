'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, setUnauthorizedHandler } from '../lib/axios';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  role: 'ADMIN' | 'USER';
  created_at: string;
}

export interface SignupPayload {
  email: string;
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export type AuthDialogTab = 'login' | 'signup';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
  isAuthDialogOpen: boolean;
  authDialogTab: AuthDialogTab;
  openAuthDialog: (tab?: AuthDialogTab) => void;
  closeAuthDialog: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [authDialogTab, setAuthDialogTab] = useState<AuthDialogTab>('login');

  // The app requires an authenticated session, so the dialog is open whenever
  // we know there's no user (initial check done, still logged out) even if it
  // was never manually opened — this covers logout and a failed silent refresh
  // too. Derived at render time rather than synced via an effect+setState.
  const isAuthDialogOpen = manualDialogOpen || (!isLoading && !user);

  useEffect(() => {
    // If a silent refresh fails anywhere in the app, drop the local user so the
    // UI falls back to signed-out state instead of showing stale data.
    setUnauthorizedHandler(() => setUser(null));

    let cancelled = false;
    api
      .get<AuthUser>('/api/v1/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.data);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.post<AuthUser>('/api/v1/auth/login', { identifier, password });
    setUser(res.data);
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const res = await api.post<AuthUser>('/api/v1/auth/google', { credential });
    setUser(res.data);
  }, []);

  const signup = useCallback(async (payload: SignupPayload) => {
    const res = await api.post<AuthUser>('/api/v1/auth/signup', payload);
    setUser(res.data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const openAuthDialog = useCallback((tab: AuthDialogTab = 'login') => {
    setAuthDialogTab(tab);
    setManualDialogOpen(true);
  }, []);

  // Only takes effect once a user is actually present — otherwise isAuthDialogOpen's
  // "no user" clause immediately forces it back open, which is the intended behavior.
  const closeAuthDialog = useCallback(() => setManualDialogOpen(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login,
      loginWithGoogle,
      signup,
      logout,
      isAuthDialogOpen,
      authDialogTab,
      openAuthDialog,
      closeAuthDialog,
    }),
    [
      user,
      isLoading,
      login,
      loginWithGoogle,
      signup,
      logout,
      isAuthDialogOpen,
      authDialogTab,
      openAuthDialog,
      closeAuthDialog,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
