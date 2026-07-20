import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { api, post } from '../lib/api';
import type { User } from '../types';

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const me = await api<User>('/auth/me');
    setUser(me);
  };

  useEffect(() => {
    let active = true;
    async function authenticate() {
      try {
        const telegram = window.Telegram?.WebApp;
        telegram?.ready();
        telegram?.expand();
        const referralFromUrl = new URLSearchParams(window.location.search).get('ref');
        if (referralFromUrl && /^[a-zA-Z0-9_-]{6,32}$/.test(referralFromUrl)) sessionStorage.setItem('poker-club-referral', referralFromUrl);
        const browserInvite = window.location.pathname === '/browser-login'
          ? new URLSearchParams(window.location.search).get('token')
          : null;
        if (browserInvite) {
          window.history.replaceState({}, '', '/browser-login');
          localStorage.removeItem('poker-club-token');
          localStorage.removeItem('poker-club-auth-method');
          const result = await post<{ token: string; user: User; expiresAt: string }>('/auth/browser/exchange', { token: browserInvite });
          localStorage.setItem('poker-club-token', result.token);
          localStorage.setItem('poker-club-auth-method', 'browser');
          window.history.replaceState({}, '', '/');
          if (active) setUser(result.user);
          return;
        }
        if (window.location.pathname === '/browser-login') {
          throw new Error('В ссылке отсутствует код доступа. Запросите новое приглашение у администратора.');
        }

        const existing = localStorage.getItem('poker-club-token');
        if (existing) {
          try {
            const me = await api<User>('/auth/me');
            if (active) setUser(me);
            return;
          } catch {
            const wasBrowserSession = localStorage.getItem('poker-club-auth-method') === 'browser';
            localStorage.removeItem('poker-club-token');
            localStorage.removeItem('poker-club-auth-method');
            if (wasBrowserSession && !telegram?.initData) {
              throw new Error('Браузерная сессия истекла или была отозвана. Запросите новую ссылку у администратора.');
            }
          }
        }

        const devId = import.meta.env.VITE_DEV_TELEGRAM_ID;
        const referralCode = sessionStorage.getItem('poker-club-referral') ?? undefined;
        const payload = telegram?.initData
          ? { initData: telegram.initData, referralCode }
          : devId
            ? { devUser: { id: Number(devId), first_name: 'Алексей', last_name: 'Ковалёв', username: 'demo_admin' }, referralCode }
            : { initData: '' };
        const result = await post<{ token: string; user: User }>('/auth/telegram', payload);
        localStorage.setItem('poker-club-token', result.token);
        localStorage.setItem('poker-club-auth-method', 'telegram');
        sessionStorage.removeItem('poker-club-referral');
        if (referralFromUrl) {
          const cleanUrl = new URL(window.location.href); cleanUrl.searchParams.delete('ref');
          window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        }
        if (active) setUser(result.user);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Не удалось войти через Telegram');
      } finally {
        if (active) setLoading(false);
      }
    }
    void authenticate();
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({ user, loading, error, refresh }), [user, loading, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return value;
}
