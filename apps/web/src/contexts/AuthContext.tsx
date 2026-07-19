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
        const existing = localStorage.getItem('poker-club-token');
        if (existing) {
          try {
            const me = await api<User>('/auth/me');
            if (active) setUser(me);
            return;
          } catch { localStorage.removeItem('poker-club-token'); }
        }

        const devId = import.meta.env.VITE_DEV_TELEGRAM_ID;
        const payload = telegram?.initData
          ? { initData: telegram.initData }
          : devId
            ? { devUser: { id: Number(devId), first_name: 'Алексей', last_name: 'Ковалёв', username: 'demo_admin' } }
            : { initData: '' };
        const result = await post<{ token: string; user: User }>('/auth/telegram', payload);
        localStorage.setItem('poker-club-token', result.token);
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
