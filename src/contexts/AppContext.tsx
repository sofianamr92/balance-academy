import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';
import { translations } from '../i18n/translations';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, setInMemoryAuthToken } from '../lib/authToken';
import type { Locale, UserProfile } from '../types';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AppContextValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: (typeof translations)['ar'];
  user: UserProfile | null;
  authLoading: boolean;
  refreshUser: () => Promise<void>;
  loginWithGoogle: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
  toasts: ToastMessage[];
  pushToast: (type: ToastMessage['type'], text: string) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('ba_locale');
    return saved === 'en' ? 'en' : 'ar';
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dir: 'rtl' | 'ltr' = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    localStorage.setItem('ba_locale', locale);
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  }, []);

  const pushToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const currentFbUser = auth.currentUser;
      if (currentFbUser) {
        const token = await currentFbUser.getIdToken();
        setInMemoryAuthToken(token);
      }
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = (await res.json()) as { user: UserProfile | null };
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        const token = await fbUser.getIdToken();
        setInMemoryAuthToken(token);
        void refreshUser();
      } else {
        setInMemoryAuthToken(null);
      }
    });
    return () => unsub();
  }, [refreshUser]);

  const loginWithGoogle = useCallback(async (): Promise<UserProfile | null> => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    setInMemoryAuthToken(idToken);
    const res = await fetch('/api/auth/firebase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      credentials: 'include',
      body: JSON.stringify({ idToken }),
    });
    const data = (await res.json()) as { user?: UserProfile; error?: string };
    if (!res.ok || !data.user) {
      throw new Error(data.error || 'Google authentication failed');
    }
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    setInMemoryAuthToken(null);
    await signOut(auth).catch(() => undefined);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  }, []);

  const t = translations[locale] as (typeof translations)['ar'];

  return (
    <AppContext.Provider
      value={{
        locale,
        dir,
        setLocale,
        toggleLocale,
        t,
        user,
        authLoading,
        refreshUser,
        loginWithGoogle,
        logout,
        toasts,
        pushToast,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
